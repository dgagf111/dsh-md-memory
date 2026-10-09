import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryStore } from '../src/store.js';
import { createLogger } from '../src/logging.js';
import { markdown, encodeMemory } from '../src/codec.js';
import { MemoryError, type Logger, type ProjectIdentity, type WriteInput } from '../src/types.js';
let root: string, store: MemoryStore, logger: Logger;
const alpha: ProjectIdentity = { id: 'alpha-aaaaaaaaaaaaaaaa', cwd: 'C:/work/alpha', root: 'C:/work/alpha/.git', kind: 'git' };
const beta: ProjectIdentity = { id: 'beta-bbbbbbbbbbbbbbbb', cwd: 'C:/work/beta', root: 'C:/work/beta/.git', kind: 'git' };
const input = (overrides: Partial<WriteInput> = {}): WriteInput => ({ name: 'memory-rule', scope: 'user', type: 'feedback', title: 'Markdown 存储约定', description: '选择持久化方式时参考', body: '唯一持久化格式是 Markdown。', source: { session: 'test', turn: 1, kind: 'agent' }, ...overrides });
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'md-memory-test-')); logger = createLogger(root, true); store = new MemoryStore(root, logger); });
afterEach(async () => { await logger.flush(); await rm(root, { recursive: true, force: true }); });
describe('Markdown store', () => {
  it('commits index, revisions and Markdown logs and reloads without a database', async () => {
    const one = await store.write(input());
    const two = await store.write(input({ body: '仅使用 Markdown，不使用数据库。', expectedRevision: one.revision, expectedHash: one.hash }));
    expect(two.revision).toBe(2);
    expect((await new MemoryStore(root, logger).snapshot()).memories[0]?.body).toContain('不使用数据库');
    expect(await readFile(join(root, 'user', 'MEMORY.md'), 'utf8')).toContain('memory-rule.md');
    expect(await readdir(join(root, 'user', 'history', 'memory-rule'))).toHaveLength(1);
    await logger.flush();
    const files = await readdir(root, { recursive: true, withFileTypes: true });
    expect(files.filter(f => f.isFile()).every(f => f.name.endsWith('.md'))).toBe(true);
    const log = await readFile(join(root, 'logs', (await readdir(join(root, 'logs')))[0]!), 'utf8');
    expect(log).toContain('memory.write_committed');
    expect(log).not.toContain('唯一持久化格式');
  });
  it('rejects stale concurrent updates; one writer commits and one sees conflict', async () => {
    const one = await store.write(input());
    const results = await Promise.allSettled([store.write(input({ body: '版本 A', expectedRevision: one.revision, expectedHash: one.hash })), store.write(input({ body: '版本 B', expectedRevision: one.revision, expectedHash: one.hash }))]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find(r => r.status === 'rejected');
    expect(failed?.status === 'rejected' && failed.reason.code).toBe('REVISION_CONFLICT');
    expect((await store.read('user', 'memory-rule')).revision).toBe(2);
  });
  it('detects an external editor change even if revision did not change', async () => {
    const one = await store.write(input());
    await writeFile(one.filePath, (await readFile(one.filePath, 'utf8')).replace('唯一持久化格式', '人工编辑后的格式'));
    await expect(store.write(input({ expectedRevision: one.revision, expectedHash: one.hash }))).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
  });
  it('erases body/history on forget and prevents automatic resurrection', async () => {
    const one = await store.write(input());
    await store.write(input({ body: '更新后的约定', expectedRevision: one.revision, expectedHash: one.hash }));
    await store.forget('user', 'memory-rule');
    expect((await store.snapshot()).memories).toHaveLength(0);
    await expect(readFile(join(root, 'user', 'history', 'memory-rule', 'anything'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(join(root, 'user', 'forgotten', 'memory-rule.md'), 'utf8')).not.toContain('更新后的约定');
    await expect(store.write(input({ source: { session: 'test', turn: 1, kind: 'extraction' } }))).rejects.toMatchObject({ code: 'FORGOTTEN_MEMORY' });
    await expect(store.write(input())).rejects.toMatchObject({ code: 'FORGOTTEN_MEMORY' });
    await store.write(input({ source: { session: 'test', turn: 2, kind: 'explicit-user' } }));
    expect((await store.snapshot()).memories).toHaveLength(1);
  });
  it('reports malformed files while valid memories remain usable', async () => {
    await store.write(input());
    await writeFile(join(root, 'user', 'broken.md'), '---\ntitle: [unterminated\n---\nbody');
    expect((await store.snapshot()).diagnostics[0]?.code).toBe('INVALID_METADATA');
    await store.write(input({ name: 'second-memory' }));
    expect((await store.snapshot()).memories).toHaveLength(2);
  });
  it('recovers an interrupted journal and rebuilds the index', async () => {
    const one = await store.write(input());
    const { filePath: _path, hash: _hash, ...memory } = one;
    const content = encodeMemory({ ...memory, body: '恢复后的正文', revision: 2, operationId: 'recover-test' });
    const directory = join(root, 'user', 'transactions'); await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'recover-test.md'), markdown({ operation: 'recover-test', action: 'write', name: one.name, expectedHash: one.hash, content }, '# Pending operation'));
    await store.recoverAll();
    expect((await store.read('user', one.name)).body).toBe('恢复后的正文');
    expect(await readdir(directory)).toHaveLength(0);
    expect(await readFile(join(root, 'user', 'MEMORY.md'), 'utf8')).toContain(one.title);
  });
  it('rejects credentials and path traversal before persisting', async () => {
    await expect(store.write(input({ name: '../escape' }))).rejects.toMatchObject({ code: 'INVALID_NAME' });
    await expect(store.write(input({ body: 'api_key=sk-abcdefghijklmnopqrstuvwxyz123456' }))).rejects.toMatchObject({ code: 'SENSITIVE_CONTENT' });
    await expect(store.write(input({ operationId: '../escape' }))).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect((await store.snapshot()).memories).toHaveLength(0);
  });
  it('rejects multiline credentials before body, journal or revision commit', async () => {
    await expect(store.write(input({ body: 'password:\n  abcdefghijklmnopqrstuvwxyz' }))).rejects.toMatchObject({ code: 'SENSITIVE_CONTENT' });
    expect((await store.snapshot()).memories).toHaveLength(0);
    await expect(readFile(join(root, 'user', 'memory-rule.md'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('keeps checkpoints constant-sized and never regresses their event watermark', async () => {
    await store.saveCheckpoint(undefined, 'long-session', { boundary: 500000, lastSuccess: new Date().toISOString() });
    await store.saveCheckpoint(undefined, 'long-session', { boundary: 40 });
    expect((await store.checkpoint(undefined, 'long-session')).boundary).toBe(500000);
    const directory = join(root, 'user', 'state');
    const content = await readFile(join(directory, (await readdir(directory))[0]!), 'utf8');
    expect(Buffer.byteLength(content)).toBeLessThan(512);
  });
});

describe('cross-project reads', () => {
  const inProject = (project: ProjectIdentity, name: string) => store.write(input({ name, scope: 'project', body: name + ' 的正文。' }), project);

  it('lists every project directory and reports broken ones instead of failing', async () => {
    await store.initializeProject(alpha);
    await store.initializeProject(beta);
    await mkdir(join(root, 'projects', 'broken-cccccccccccccccc'), { recursive: true });
    await writeFile(join(root, 'projects', 'broken-cccccccccccccccc', 'PROJECT.md'), 'not frontmatter');
    const registry = await store.projects();
    expect(registry.projects.map(project => project.id)).toEqual([alpha.id, beta.id]);
    expect(registry.invalid.map(entry => entry.id)).toEqual(['broken-cccccccccccccccc']);
    await expect(store.project('../user')).rejects.toMatchObject({ code: 'INVALID_PROJECT' });
  });

  it('merges granted sources into the snapshot with their own source key', async () => {
    await store.initializeProject(alpha);
    await store.initializeProject(beta);
    await inProject(alpha, 'own-rule');
    await inProject(beta, 'beta-rule');
    await store.write(input({ name: 'user-rule', body: '用户正文。' }));
    const plain = await store.snapshot(alpha);
    expect(plain.memories.map(memory => memory.name).sort()).toEqual(['own-rule', 'user-rule']);
    const merged = await store.snapshot(alpha, false, [beta]);
    const byName = new Map(merged.memories.map(memory => [memory.name, memory]));
    expect([...byName.keys()].sort()).toEqual(['beta-rule', 'own-rule', 'user-rule']);
    expect(byName.get('beta-rule')?.sourceKey).toBe(beta.id);
    expect(byName.get('own-rule')?.sourceKey).toBe(alpha.id);
    expect(byName.get('user-rule')?.sourceKey).toBe('user');
  });

  it('never persists the source key into the Markdown file', async () => {
    await store.initializeProject(alpha);
    const written = await inProject(alpha, 'own-rule');
    const content = await readFile(written.filePath, 'utf8');
    expect(content).not.toContain('sourceKey');
    expect((await store.read('project', 'own-rule', alpha)).sourceKey).toBe(alpha.id);
  });
});

describe('moving memories between scopes', () => {
  it('moves user → project → project → user while preserving content, creation time and revision', async () => {
    await store.initializeProject(alpha);
    await store.initializeProject(beta);
    const first = await store.write(input({ tags: ['偏好'] }));
    const second = await store.write(input({ body: '移动前的正文。', tags: ['偏好'], expectedRevision: first.revision, expectedHash: first.hash }));
    const moved = await store.move('memory-rule', { scope: 'user' }, { scope: 'project', project: alpha }, { revision: second.revision, hash: second.hash });
    expect(moved).toMatchObject({ name: 'memory-rule', body: '移动前的正文。', scope: 'project', sourceKey: alpha.id, created: second.created, revision: second.revision, tags: ['偏好'] });
    expect(moved.id).toBe('project:memory-rule');
    expect(moved.modified >= second.modified).toBe(true);
    // The source keeps only a forgotten marker, so later extraction cannot write it back.
    await expect(store.read('user', 'memory-rule')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(store.write(input({ source: { session: 'test', turn: 9, kind: 'extraction' } }))).rejects.toMatchObject({ code: 'FORGOTTEN_MEMORY' });
    expect((await store.snapshot()).memories).toHaveLength(0);
    await expect(readdir(join(root, 'user', 'history', 'memory-rule'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(join(root, 'projects', alpha.id, 'MEMORY.md'), 'utf8')).toContain('memory-rule.md');
    expect(await readFile(join(root, 'user', 'MEMORY.md'), 'utf8')).not.toContain('memory-rule.md');
    // project → another project
    const elsewhere = await store.move('memory-rule', { scope: 'project', project: alpha }, { scope: 'project', project: beta });
    expect(elsewhere.sourceKey).toBe(beta.id);
    expect((await readdir(join(root, 'projects', alpha.id))).includes('memory-rule.md')).toBe(false);
    // project → user
    const home = await store.move('memory-rule', { scope: 'project', project: beta }, { scope: 'user' });
    expect(home).toMatchObject({ scope: 'user', sourceKey: 'user', id: 'user:memory-rule', created: second.created });
    expect((await readdir(join(root, 'projects', beta.id))).includes('memory-rule.md')).toBe(false);
    expect((await store.snapshot()).memories.map(memory => memory.name)).toEqual(['memory-rule']);
  });

  it('refuses to overwrite a destination name, a same-scope move or a stale source', async () => {
    await store.initializeProject(alpha);
    const mine = await store.write(input({ name: 'shared-name', body: '用户层正文。' }));
    await store.write(input({ name: 'shared-name', scope: 'project', body: '项目层正文。' }), alpha);
    await expect(store.move('shared-name', { scope: 'user' }, { scope: 'project', project: alpha })).rejects.toMatchObject({ code: 'NAME_CONFLICT' });
    await expect(store.move('shared-name', { scope: 'user' }, { scope: 'user' })).rejects.toMatchObject({ code: 'SAME_TARGET' });
    await expect(store.move('shared-name', { scope: 'project', project: alpha }, { scope: 'user' }, { revision: mine.revision + 1, hash: mine.hash })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    expect((await store.read('user', 'shared-name')).body).toBe('用户层正文。');
    expect((await store.read('project', 'shared-name', alpha)).body).toBe('项目层正文。');
    expect((await store.snapshot()).memories).toHaveLength(1);
  });

  it('undoes the destination copy when the source cannot be released', async () => {
    await store.initializeProject(alpha);
    await store.write(input());
    const internal = store as unknown as { commit: (directory: string, transaction: { action: string }) => Promise<void> };
    const commit = internal.commit.bind(store);
    let released = false;
    internal.commit = async (directory, transaction) => {
      if (transaction.action !== 'forget') return commit(directory, transaction);
      released = true;
      throw new MemoryError('COMMIT_INCOMPLETE', 'simulated source failure');
    };
    await expect(store.move('memory-rule', { scope: 'user' }, { scope: 'project', project: alpha })).rejects.toMatchObject({ code: 'COMMIT_INCOMPLETE' });
    expect(released).toBe(true);
    await expect(store.read('project', 'memory-rule', alpha)).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await store.read('user', 'memory-rule')).name).toBe('memory-rule');
    expect(await readFile(join(root, 'projects', alpha.id, 'MEMORY.md'), 'utf8')).not.toContain('memory-rule.md');
  });

  it('lets an explicit move clear an old forgotten marker in the destination', async () => {
    await store.initializeProject(alpha);
    await store.write(input({ name: 'revived-rule', scope: 'project', body: '已经遗忘的旧正文。' }), alpha);
    await store.forget('project', 'revived-rule', alpha);
    await store.write(input({ name: 'revived-rule', body: '用户层的新正文。' }));
    const moved = await store.move('revived-rule', { scope: 'user' }, { scope: 'project', project: alpha });
    expect(moved.body).toBe('用户层的新正文。');
    expect((await readdir(join(root, 'projects', alpha.id, 'forgotten'))).includes('revived-rule.md')).toBe(false);
    expect((await store.snapshot(alpha)).memories.map(memory => memory.name)).toEqual(['revived-rule']);
  });
});
