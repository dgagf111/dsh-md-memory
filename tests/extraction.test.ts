import { it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../src/store.js';
import { createLogger } from '../src/logging.js';
import { ExtractionScheduler, type ExtractionTask } from '../src/extraction.js';
const task: ExtractionTask = { session: 'extract-test', turn: 1, boundary: 10, provider: 'mock', model: 'mock', observedAt: new Date().toISOString(), messages: [{ id: 'u1', seq: 2, role: 'user', text: '我的长期偏好：各个项目都用中文解释。' }, { id: 'a1', seq: 5, role: 'assistant', text: '理解。' }] };
it('writes omissions once, resumes from checkpoint, and exposes invalid output without marking success', async () => {
  const root = await mkdtemp(join(tmpdir(), 'md-extraction-')); const logger = createLogger(root, true); const store = new MemoryStore(root, logger);
  let calls = 0;
  const scheduler = new ExtractionScheduler(store, async (_task, _system, input) => {
    calls++; expect(JSON.parse(input).newMessages.length).toBe(2);
    return JSON.stringify({ operations: [{ action: 'write', scope: 'user', name: 'chinese-preference', type: 'user', title: '中文沟通', description: '跨项目的语言偏好', body: '用户偏好用中文解释。' }] });
  }, logger);
  try {
    scheduler.schedule(task); await scheduler.drain();
    expect(scheduler.status(task.session).state).toBe('completed');
    expect((await store.snapshot()).memories).toHaveLength(1);
    scheduler.schedule(task); await scheduler.drain(); expect(calls).toBe(1);
    const broken = new ExtractionScheduler(store, async () => 'not-json', logger, 5, 1);
    broken.schedule({ ...task, turn: 2, boundary: 20, messages: [...task.messages, { id: 'u2', seq: 15, role: 'user', text: '新的长期决定' }] }); await broken.drain();
    expect(broken.status(task.session).state).toBe('failed');
    expect((await store.checkpoint(undefined, task.session)).boundary).toBe(10);
    expect((await store.checkpoint(undefined, task.session)).lastError).toContain('invalid JSON');
    await broken.stop();
  } finally { await scheduler.stop(); await logger.flush(); await rm(root, { recursive: true, force: true }); }
});
it('does not send the entire large memory library to the extraction model', async () => {
  const root = await mkdtemp(join(tmpdir(), 'md-large-extraction-')); const logger = createLogger(root); const store = new MemoryStore(root, logger);
  try {
    for (let i = 0; i < 8; i++) await store.write({ name: `stored-${i}`, scope: 'user', type: 'reference', title: `参考 ${i}`, description: '数据库资料指针', body: '大量已有参考正文。'.repeat(1800), source: { session: 'prior', turn: 1, kind: 'agent' } });
    const scheduler = new ExtractionScheduler(store, async (_task, _policy, input) => {
      const payload = JSON.parse(input); expect(payload.existingTotal).toBe(8);
      expect(Buffer.byteLength(input)).toBeLessThan(65536);
      expect(payload.existingMemories.every((m: { body?: string }) => !m.body)).toBe(true);
      return '{"operations":[]}';
    }, logger);
    scheduler.schedule(task); await scheduler.drain();
    expect(scheduler.status(task.session).state).toBe('completed'); await scheduler.stop();
  } finally { await logger.flush(); await rm(root, { recursive: true, force: true }); }
});
