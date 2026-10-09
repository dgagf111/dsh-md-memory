import { beforeEach, afterEach, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryStore } from '../src/store.js';
import { createLogger } from '../src/logging.js';
import { ExtractionScheduler, type ExtractionTask } from '../src/extraction.js';
let root: string, store: MemoryStore;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'md-fragment-recovery-')); store = new MemoryStore(root, createLogger(root)); });
afterEach(async () => { await store.logger.flush(); await rm(root, { recursive: true, force: true }); });

it.each([
  ['assistant remainder', '短用户消息', '助'.repeat(45000)],
  ['assistant remainder after a whole user message', 'A'.repeat(30000), 'B'.repeat(60000)],
  ['two fragments of a message in one batch', 'A'.repeat(52800), 'B'.repeat(60000)],
])('resumes %s without losing or repeating committed text', async (_case, user, assistant) => {
  let calls = 0;
  const committed: string[] = [];
  const complete: ConstructorParameters<typeof ExtractionScheduler>[1] = async (_task, _system, input) => {
    calls++;
    if (calls === 2) throw new Error('interrupted second batch');
    const payload = JSON.parse(input) as { newMessages: { text: string }[] };
    committed.push(...payload.newMessages.map(message => message.text));
    return '{"operations":[]}';
  };
  const scheduler = new ExtractionScheduler(store, complete, store.logger, 5, 1);
  const task: ExtractionTask = { session: 'fragment-resume', turn: 1, boundary: 10, provider: 'mock', model: 'mock', observedAt: new Date().toISOString(),
    messages: [{ id: 'u1', seq: 2, role: 'user', text: user }, { id: 'a1', seq: 3, role: 'assistant', text: assistant }] };
  try {
    scheduler.schedule(task); await scheduler.drain();
    expect(scheduler.status(task.session).state).toBe('failed');
    const resumed = new ExtractionScheduler(new MemoryStore(root, store.logger), complete, store.logger, 5, 1);
    try {
      resumed.schedule(task); await resumed.drain();
      expect(resumed.status(task.session).state).toBe('completed');
    } finally { await resumed.stop(); }
    // Length checks give a useful failure without dumping 100 KiB into logs.
    expect(committed.join('').length).toBe(user.length + assistant.length);
    expect(committed.join('') === user + assistant).toBe(true);
    expect((await store.checkpoint(undefined, task.session)).boundary).toBe(10);
  } finally { await scheduler.stop(); }
});

it('does not duplicate a committed operation when a later write fails in the same batch', async () => {
  const write = store.write.bind(store);
  let fail = true;
  store.write = async (...args) => {
    if (args[0].name === 'second-topic' && fail) { fail = false; throw new Error('second write failed'); }
    return write(...args);
  };
  const scheduler = new ExtractionScheduler(store, async (_task, _system, input) => {
    const candidate = JSON.parse(input).existingMemories.find((memory: { name: string }) => memory.name === 'first-topic');
    return JSON.stringify({ operations: [
      { action: 'write', scope: 'user', name: 'first-topic', title: '第一条', description: '第一条偏好', type: 'user', body: candidate ? '重试输出应被去重' : '原始正文',
        ...(candidate ? { expectedRevision: candidate.revision, expectedHash: candidate.hash } : {}) },
      { action: 'write', scope: 'user', name: 'second-topic', title: '第二条', description: '第二条偏好', type: 'user', body: '第二条正文' },
    ] });
  }, store.logger, 5, 1);
  const task: ExtractionTask = { session: 'partial-operation', turn: 1, boundary: 10, provider: 'mock', model: 'mock', observedAt: new Date().toISOString(),
    messages: [{ id: 'u1', seq: 2, role: 'user', text: '两条长期偏好' }] };
  try {
    scheduler.schedule(task); await scheduler.drain();
    expect(scheduler.status(task.session).state).toBe('failed');
    expect((await store.checkpoint(undefined, task.session)).boundary).toBe(-1);
    scheduler.schedule(task); await scheduler.drain();
    expect(scheduler.status(task.session).state).toBe('completed');
    expect(await store.read('user', 'first-topic')).toMatchObject({ revision: 1, body: '原始正文' });
    expect(await store.read('user', 'second-topic')).toMatchObject({ revision: 1, body: '第二条正文' });
    expect((await store.checkpoint(undefined, task.session)).boundary).toBe(10);
  } finally { await scheduler.stop(); }
});
