import { it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../src/store.js';
import { createLogger } from '../src/logging.js';
import { ExtractionScheduler, type ExtractionMessage, type ExtractionTask } from '../src/extraction.js';

/** One extraction request as the background model receives it. */
interface Payload {
  newMessages: { id: string; seq: number; role: string; text: string; part?: number; parts?: number }[];
  existingTotal: number; existingShown: number; existingDisabled: number;
  existingMemories: { scope: string; name: string; description: string; status: string; revision: number; hash: string; body?: string }[];
}
const parse = (input: string): Payload => JSON.parse(input) as Payload;
const LIMIT = 128 * 1024;
const stamp = (): string => new Date().toISOString();

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
it('splits one oversized message by actual JSON bytes, in order, once per fragment', async () => {
  const root = await mkdtemp(join(tmpdir(), 'md-extraction-chunks-')); const logger = createLogger(root); const store = new MemoryStore(root, logger);
  // 45,000 Han characters are 135,000 UTF-8 bytes: well past one 128 KiB request.
  const body = '汉'.repeat(45000);
  const payloads: Payload[] = [];
  const scheduler = new ExtractionScheduler(store, async (_task, _policy, input) => {
    expect(Buffer.byteLength(input)).toBeLessThanOrEqual(LIMIT);
    payloads.push(parse(input));
    return '{"operations":[]}';
  }, logger, 5, 1);
  const huge: ExtractionTask = { session: 'huge-window', turn: 1, boundary: 7, provider: 'mock', model: 'mock', observedAt: stamp(), messages: [{ id: 'u1', seq: 3, role: 'user', text: body }] };
  try {
    scheduler.schedule(huge); await scheduler.drain();
    expect(scheduler.status(huge.session).state).toBe('completed');
    expect(payloads.length).toBeGreaterThan(1);
    const parts = payloads.flatMap(payload => payload.newMessages);
    expect(parts.length).toBe(payloads.length);
    expect(parts.map(part => part.text).join('')).toBe(body);
    expect(parts.every((part, index) => part.seq === 3 && part.role === 'user' && part.id === 'u1' && part.part === index + 1 && part.parts === parts.length)).toBe(true);
    expect((await store.checkpoint(undefined, huge.session))).toMatchObject({ boundary: 7 });
    expect((await store.checkpoint(undefined, huge.session)).offset ?? 0).toBe(0);
    const calls = payloads.length;
    scheduler.schedule(huge); await scheduler.drain();
    expect(payloads.length).toBe(calls);
    // The same session keeps taking input: the next short message is extracted on
    // its own instead of being blocked behind the oversized window.
    scheduler.schedule({ ...huge, turn: 2, boundary: 12, messages: [...huge.messages, { id: 'u2', seq: 11, role: 'user', text: '追加偏好：只用中文回答。' }] });
    await scheduler.drain();
    expect(payloads.length).toBe(calls + 1);
    expect(payloads.at(-1)!.newMessages.map(part => part.text)).toEqual(['追加偏好：只用中文回答。']);
    expect((await store.checkpoint(undefined, huge.session)).boundary).toBe(12);
  } finally { await scheduler.stop(); await logger.flush(); await rm(root, { recursive: true, force: true }); }
});
it('never splits a surrogate pair when fragmenting an oversized message', async () => {
  const root = await mkdtemp(join(tmpdir(), 'md-extraction-unicode-')); const logger = createLogger(root); const store = new MemoryStore(root, logger);
  const body = '😀'.repeat(40000);
  const payloads: Payload[] = [];
  const scheduler = new ExtractionScheduler(store, async (_task, _policy, input) => { payloads.push(parse(input)); return '{"operations":[]}'; }, logger, 5, 1);
  const huge: ExtractionTask = { session: 'unicode-window', turn: 1, boundary: 2, provider: 'mock', model: 'mock', observedAt: stamp(), messages: [{ id: 'u1', seq: 2, role: 'user', text: body }] };
  try {
    scheduler.schedule(huge); await scheduler.drain();
    const parts = payloads.flatMap(payload => payload.newMessages);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(Buffer.from(part.text, 'utf8').toString('utf8')).toBe(part.text);
    expect(parts.map(part => part.text).join('')).toBe(body);
    expect(scheduler.status(huge.session).state).toBe('completed');
  } finally { await scheduler.stop(); await logger.flush(); await rm(root, { recursive: true, force: true }); }
});
it('batches several messages by JSON byte budget without dropping or repeating any of them', async () => {
  const root = await mkdtemp(join(tmpdir(), 'md-extraction-many-')); const logger = createLogger(root); const store = new MemoryStore(root, logger);
  const messages: ExtractionMessage[] = [
    { id: 'u1', seq: 2, role: 'user', text: `长消息：${'甲'.repeat(30000)}` },
    { id: 'a1', seq: 3, role: 'assistant', text: '收到，我记下了。' },
    { id: 'u2', seq: 4, role: 'user', text: `${'乙'.repeat(30000)}：第二条长消息` },
    { id: 'u3', seq: 5, role: 'user', text: '偏好三：简短即可。' },
  ];
  const payloads: Payload[] = [];
  const scheduler = new ExtractionScheduler(store, async (_task, _policy, input) => {
    expect(Buffer.byteLength(input)).toBeLessThanOrEqual(LIMIT);
    payloads.push(parse(input)); return '{"operations":[]}';
  }, logger, 5, 1);
  const many: ExtractionTask = { session: 'many-window', turn: 3, boundary: 5, provider: 'mock', model: 'mock', observedAt: stamp(), messages };
  try {
    scheduler.schedule(many); await scheduler.drain();
    expect(scheduler.status(many.session).state).toBe('completed');
    expect(payloads.length).toBeGreaterThan(1);
    const parts = payloads.flatMap(payload => payload.newMessages);
    expect(parts.map(part => part.text).join('')).toBe(messages.map(message => message.text).join(''));
    expect(parts.map(part => part.seq)).toEqual([...parts.map(part => part.seq)].sort((a, b) => a - b));
    for (const message of messages) {
      const own = parts.filter(part => part.id === message.id);
      expect(own.length).toBeGreaterThan(0);
      expect(own.map(part => part.text).join('')).toBe(message.text);
      expect(own.every(part => part.role === message.role && part.seq === message.seq)).toBe(true);
    }
    expect((await store.checkpoint(undefined, many.session)).boundary).toBe(5);
  } finally { await scheduler.stop(); await logger.flush(); await rm(root, { recursive: true, force: true }); }
});
it('resumes from the last committed batch after a failure without skipping or repeating content', async () => {
  const root = await mkdtemp(join(tmpdir(), 'md-extraction-resume-')); const logger = createLogger(root); const store = new MemoryStore(root, logger);
  const body = '丙'.repeat(45000);
  const captured: Payload[] = [];
  let calls = 0;
  const scheduler = new ExtractionScheduler(store, async (_task, _policy, input) => {
    calls += 1;
    if (calls === 2) throw new Error('provider offline');
    captured.push(parse(input)); return '{"operations":[]}';
  }, logger, 5, 1);
  const huge: ExtractionTask = { session: 'resume-window', turn: 1, boundary: 9, provider: 'mock', model: 'mock', observedAt: stamp(), messages: [{ id: 'u1', seq: 4, role: 'user', text: body }] };
  try {
    scheduler.schedule(huge); await scheduler.drain();
    expect(scheduler.status(huge.session).state).toBe('failed');
    expect(scheduler.status(huge.session).lastError).toContain('provider offline');
    expect(calls).toBe(2);
    // The committed first batch survives: a mid-message offset, not the old boundary.
    const checkpoint = await store.checkpoint(undefined, huge.session);
    expect(checkpoint.boundary).toBeLessThan(9);
    expect(checkpoint.offset ?? 0).toBeGreaterThan(0);
    expect(checkpoint.offsetSeq).toBe(4);
    scheduler.schedule(huge); await scheduler.drain();
    expect(scheduler.status(huge.session).state).toBe('completed');
    expect(calls).toBeGreaterThan(2);
    expect(captured.flatMap(payload => payload.newMessages).map(part => part.text).join('')).toBe(body);
    expect((await store.checkpoint(undefined, huge.session)).boundary).toBe(9);
    expect((await store.checkpoint(undefined, huge.session)).offset ?? 0).toBe(0);
  } finally { await scheduler.stop(); await logger.flush(); await rm(root, { recursive: true, force: true }); }
});
it('keeps a stable per-batch operation id so a same-name topic updated in two batches is not deduplicated', async () => {
  const root = await mkdtemp(join(tmpdir(), 'md-extraction-batches-')); const logger = createLogger(root); const store = new MemoryStore(root, logger);
  const messages: ExtractionMessage[] = [
    // 17,000 Han characters are 51,000 bytes: one fragment each, but only one
    // fragment fits a request, so the two messages land in two batches.
    { id: 'u1', seq: 2, role: 'user', text: '甲'.repeat(17000) },
    { id: 'u2', seq: 3, role: 'user', text: '乙'.repeat(17000) },
  ];
  const seen: number[] = [];
  const scheduler = new ExtractionScheduler(store, async (_task, _policy, input) => {
    const candidate = parse(input).existingMemories.find(memory => memory.name === 'shared-topic');
    if (!candidate) return JSON.stringify({ operations: [{ action: 'write', scope: 'user', name: 'shared-topic', type: 'user', title: '共享主题', description: '第一批写下的主题', body: '第一批正文' }] });
    seen.push(candidate.revision);
    return JSON.stringify({ operations: [{ action: 'write', scope: 'user', name: 'shared-topic', type: 'user', title: '共享主题', description: '第二批更新同一主题', body: '第二批正文', expectedRevision: candidate.revision, expectedHash: candidate.hash }] });
  }, logger, 5, 1);
  const two: ExtractionTask = { session: 'multi-batch', turn: 2, boundary: 3, provider: 'mock', model: 'mock', observedAt: stamp(), messages };
  try {
    scheduler.schedule(two); await scheduler.drain();
    expect(scheduler.status(two.session).state).toBe('completed');
    expect(scheduler.status(two.session).batches).toBe(2);
    // The second batch saw the revision the first batch committed, so CAS accepted the update.
    expect(seen).toEqual([1]);
    const memory = await store.read('user', 'shared-topic');
    expect(memory.revision).toBe(2);
    expect(memory.body).toContain('第二批正文');
    expect((await store.snapshot()).memories.filter(entry => entry.name === 'shared-topic')).toHaveLength(1);
  } finally { await scheduler.stop(); await logger.flush(); await rm(root, { recursive: true, force: true }); }
});
it('shows disabled candidates and skips disabled, conflicting and forgotten proposals without blocking valid ones', async () => {
  const root = await mkdtemp(join(tmpdir(), 'md-extraction-disabled-')); const logger = createLogger(root); const store = new MemoryStore(root, logger);
  await store.write({ name: 'retired-topic', scope: 'user', type: 'reference', title: '已停用主题', description: '不再使用', body: '停用正文', status: 'disabled', source: { session: 'prior', turn: 1, kind: 'agent' } });
  await store.write({ name: 'active-topic', scope: 'user', type: 'user', title: '在用主题', description: '在用', body: '在用正文', source: { session: 'prior', turn: 2, kind: 'agent' } });
  await store.write({ name: 'gone-topic', scope: 'user', type: 'user', title: '已遗忘主题', description: '遗忘', body: '遗忘正文', source: { session: 'prior', turn: 3, kind: 'agent' } });
  await store.forget('user', 'gone-topic');
  const before = await store.read('user', 'active-topic');
  const scheduler = new ExtractionScheduler(store, async (_task, _policy, input) => {
    const payload = parse(input);
    const retired = payload.existingMemories.find(memory => memory.name === 'retired-topic');
    const active = payload.existingMemories.find(memory => memory.name === 'active-topic');
    expect(retired).toBeDefined();
    expect(active).toBeDefined();
    expect(retired!.status).toBe('disabled');
    expect(active!.revision).toBe(before.revision);
    return JSON.stringify({ operations: [
      { action: 'write', scope: 'user', name: 'retired-topic', type: 'reference', title: '重新启用', description: '不该发生', body: '不该发生', expectedRevision: retired!.revision, expectedHash: retired!.hash },
      { action: 'write', scope: 'user', name: 'active-topic', type: 'user', title: '在用主题', description: '冲突更新', body: '冲突正文', expectedRevision: 99, expectedHash: 'deadbeef' },
      { action: 'write', scope: 'user', name: 'gone-topic', type: 'user', title: '复活', description: '不该发生', body: '不该发生' },
      { action: 'write', scope: 'user', name: 'fresh-topic', type: 'user', title: '新主题', description: '本批有效写入', body: '新正文' },
    ] });
  }, logger, 5, 1);
  const batch: ExtractionTask = { session: 'skip-batch', turn: 1, boundary: 6, provider: 'mock', model: 'mock', observedAt: stamp(), messages: [{ id: 'u1', seq: 5, role: 'user', text: '把停用主题重新启用，并记下新的偏好。' }] };
  try {
    scheduler.schedule(batch); await scheduler.drain();
    const status = scheduler.status(batch.session);
    expect(status.state).toBe('completed');
    expect(status.batches).toBe(1);
    expect(status.skipped?.map(skip => skip.code).sort()).toEqual(['DISABLED_TARGET', 'FORGOTTEN_MEMORY', 'REVISION_CONFLICT']);
    expect(status.skipped?.every(skip => skip.reason.length > 0 && skip.name.length > 0)).toBe(true);
    // A rejected proposal never silently overwrites from the read revision.
    const active = await store.read('user', 'active-topic');
    expect(active.revision).toBe(before.revision);
    expect(active.hash).toBe(before.hash);
    expect(await store.read('user', 'fresh-topic')).toMatchObject({ body: '新正文', revision: 1 });
    expect(await store.read('user', 'retired-topic')).toMatchObject({ status: 'disabled', revision: 1, body: '停用正文' });
    // The window still progressed: one refusal cannot block the rest of the turn.
    expect((await store.checkpoint(undefined, batch.session)).boundary).toBe(6);
  } finally { await scheduler.stop(); await logger.flush(); await rm(root, { recursive: true, force: true }); }
});
it('fails the batch on unexpected write errors instead of skipping them', async () => {
  const root = await mkdtemp(join(tmpdir(), 'md-extraction-io-')); const logger = createLogger(root); const store = new MemoryStore(root, logger);
  const scheduler = new ExtractionScheduler(store, async () => JSON.stringify({ operations: [{ action: 'write', scope: 'user', name: 'io-topic', type: 'user', title: 'IO 主题', description: '写入', body: '正文' }] }), logger, 5, 1);
  const batch: ExtractionTask = { session: 'io-batch', turn: 1, boundary: 4, provider: 'mock', model: 'mock', observedAt: stamp(), messages: [{ id: 'u1', seq: 4, role: 'user', text: '记下这个决定。' }] };
  const original = store.write.bind(store);
  store.write = (async () => { throw new Error('disk unavailable'); }) as typeof store.write;
  try {
    scheduler.schedule(batch); await scheduler.drain();
    expect(scheduler.status(batch.session).state).toBe('failed');
    expect(scheduler.status(batch.session).lastError).toContain('disk unavailable');
    expect(scheduler.status(batch.session).skipped).toBeUndefined();
    expect((await store.checkpoint(undefined, batch.session)).boundary).toBe(-1);
  } finally {
    store.write = original;
    await scheduler.stop(); await logger.flush(); await rm(root, { recursive: true, force: true });
  }
});
