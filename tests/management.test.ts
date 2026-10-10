import { beforeEach, afterEach, it, expect } from 'vitest';
import { mkdtemp, rm, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryStore } from '../src/store.js';
import { MemoryManagement } from '../src/management.js';
import { Config } from '../src/config.js';
import { loadSettings } from '../src/settings.js';
import { createLogger } from '../src/logging.js';
import { atomicMarkdown } from '../src/files.js';
import { markdown, digest } from '../src/codec.js';
import { resolveAccess } from '../src/access.js';
import type { MemoryRuntime } from '../src/runtime.js';
import type { WriteInput, ProjectIdentity } from '../src/types.js';
let root: string, store: MemoryStore, manager: MemoryManagement;
let config: ReturnType<typeof Config>;
const input = (scope: 'user' | 'project' = 'user'): WriteInput => ({ scope, name: 'memory-example', type: 'feedback', title: '记忆约定', description: '编辑时参考', body: '保留项目决定。', source: { session: 'test', turn: 1, kind: 'agent' } });
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'md-memory-management-')); config = Config({ memoryDir: root });
  store = new MemoryStore(root, createLogger(root));
  manager = new MemoryManagement({ store, config, profileConfig: { ...config }, logger: store.logger, refreshAll: async () => [] } as unknown as MemoryRuntime);
});
afterEach(async () => { await store.logger.flush(); await rm(root, { recursive: true, force: true }); });
it('browses and edits an inactive project and retains disabled entries for management', async () => {
  const project: ProjectIdentity = { id: 'archived-project', cwd: 'C:/moved/workspace', root: 'C:/moved/workspace/.git', kind: 'git' };
  await store.initializeProject(project);
  await manager.write({ ...input('project'), projectId: project.id, status: 'disabled' });
  const groups = await manager.groups();
  expect(groups[1]?.project).toEqual(project);
  expect(groups[1]?.entries[0]?.status).toBe('disabled');
  expect('body' in groups[1]!.entries[0]!).toBe(false);
  expect((await store.snapshot(project)).memories).toHaveLength(0);
  await expect(manager.project('../user')).rejects.toMatchObject({ code: 'INVALID_PROJECT' });
});
it('rejects stale delete and stale save instead of discarding a concurrent Agent update', async () => {
  const first = await store.write(input());
  const newer = await store.write({ ...input(), body: 'Agent 补充的新信息。', expectedRevision: first.revision, expectedHash: first.hash });
  await expect(manager.forget({ scope: 'user', name: first.name, revision: first.revision, hash: first.hash })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
  await expect(manager.write({ ...input(), body: '旧草稿', expectedRevision: first.revision, expectedHash: first.hash })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
  expect((await store.read('user', first.name)).hash).toBe(newer.hash);
  await manager.forget({ scope: 'user', name: newer.name, revision: newer.revision, hash: newer.hash });
  expect((await store.snapshot()).memories).toHaveLength(0);
});
it('creates a fresh operation when a page edits a read-back memory object', async () => {
  const first = await store.write(input());
  const changed = await manager.write({ ...first, title: '手动编辑后的标题', expectedRevision: first.revision, expectedHash: first.hash });
  expect(changed.memory.revision).toBe(2);
  expect(changed.memory.title).toBe('手动编辑后的标题');
  expect(changed.memory.operationId).not.toBe(first.operationId);
});
it('moves a memory between the user scope and a project through the management API', async () => {
  const project: ProjectIdentity = { id: 'move-target-aaaaaaaaaaaa', cwd: 'C:/work/move', root: 'C:/work/move/.git', kind: 'git' };
  await store.initializeProject(project);
  const created = await manager.write({ ...input(), body: '移动过的正文。' });
  const moved = await manager.move({ scope: 'user', name: created.memory.name, revision: created.memory.revision, hash: created.memory.hash, toScope: 'project', toProjectId: project.id });
  expect(moved.memory).toMatchObject({ scope: 'project', sourceKey: project.id, body: '移动过的正文。', created: created.memory.created });
  expect((await store.snapshot()).memories).toHaveLength(0);
  expect((await store.snapshot(project)).memories.map(memory => memory.name)).toEqual([created.memory.name]);
  expect((await manager.groups()).find(group => group.id === project.id)?.entries.map(entry => entry.name)).toEqual([created.memory.name]);
  await expect(manager.move({ scope: 'project', projectId: project.id, name: created.memory.name, revision: 1, hash: 'stale', toScope: 'user' })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
  await expect(manager.move({ scope: 'project', projectId: project.id, name: created.memory.name, revision: moved.memory.revision, hash: moved.memory.hash, toScope: 'project', toProjectId: project.id })).rejects.toMatchObject({ code: 'SAME_TARGET' });
  await expect(manager.move({ scope: 'project', name: created.memory.name, revision: 1, hash: 'x', toScope: 'user' })).rejects.toMatchObject({ code: 'INVALID_SCOPE' });
  await expect(manager.move({ scope: 'user', name: created.memory.name, revision: 1, hash: 'x', toScope: 'project', toProjectId: 'missing-project' })).rejects.toMatchObject({ code: 'ENOENT' });
  const occupied = await manager.write({ ...input(), body: '用户层同名正文。' });
  await expect(manager.move({ scope: 'user', name: occupied.memory.name, revision: occupied.memory.revision, hash: occupied.memory.hash, toScope: 'project', toProjectId: project.id })).rejects.toMatchObject({ code: 'NAME_CONFLICT' });
  expect((await store.read('project', occupied.memory.name, project)).body).toBe('移动过的正文。');
  expect((await store.read('user', occupied.memory.name)).revision).toBe(1);
});
it('clears one project through the management API but never the shared user scope', async () => {
  const project: ProjectIdentity = { id: 'wipe-target-aaaaaaaaaaaa', cwd: 'C:/work/wipe', root: 'C:/work/wipe/.git', kind: 'git' };
  const other: ProjectIdentity = { id: 'keep-target-bbbbbbbbbbbb', cwd: 'C:/work/keep', root: 'C:/work/keep/.git', kind: 'git' };
  await store.initializeProject(project); await store.initializeProject(other);
  await manager.write({ ...input('project'), projectId: project.id });
  await manager.write({ ...input('project'), projectId: project.id, name: 'second-rule' });
  await manager.write({ ...input('project'), projectId: other.id, name: 'other-rule' });
  await manager.write({ ...input(), name: 'user-rule' });

  // The page must confirm, and the user scope is never a reset target.
  await expect(manager.reset({ scope: 'project', projectId: project.id })).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED' });
  await expect(manager.reset({ scope: 'project', projectId: project.id, confirm: 'yes' })).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED' });
  await expect(manager.reset({ scope: 'user', confirm: true })).rejects.toMatchObject({ code: 'USER_SCOPE_PROTECTED' });
  await expect(manager.reset(null)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  await expect(manager.reset({ scope: 'project', projectId: 'missing-project', confirm: true })).rejects.toMatchObject({ code: 'ENOENT' });
  expect((await store.snapshot(project)).memories.filter(memory => memory.scope === 'project')).toHaveLength(2);

  await expect(manager.reset({ scope: 'project', projectId: project.id, confirm: true })).resolves.toMatchObject({ removed: 2, warnings: [] });
  expect((await store.snapshot(project)).memories.filter(memory => memory.scope === 'project')).toHaveLength(0);
  expect((await manager.groups()).find(group => group.id === project.id)?.entries).toEqual([]);
  expect((await store.snapshot(other)).memories.filter(memory => memory.scope === 'project').map(memory => memory.name)).toEqual(['other-rule']);
  expect((await store.read('user', 'user-rule')).name).toBe('user-rule');
  expect((await manager.groups()).find(group => group.id === 'user')?.entries).toHaveLength(1);
});
it('deletes a cleared project from the library but never one that still holds entries', async () => {
  const project: ProjectIdentity = { id: 'delete-target-aaaaaaaa', cwd: 'C:/work/delete', root: 'C:/work/delete/.git', kind: 'git' };
  const other: ProjectIdentity = { id: 'delete-keep-bbbbbbbbbb', cwd: 'C:/work/keep', root: 'C:/work/keep/.git', kind: 'git' };
  await store.initializeProject(project); await store.initializeProject(other);
  await manager.write({ ...input('project'), projectId: project.id });
  await manager.write({ ...input('project'), projectId: other.id, name: 'other-rule' });
  await manager.write({ ...input(), name: 'user-rule' });

  await expect(manager.removeProject({ scope: 'project', projectId: project.id })).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED' });
  await expect(manager.removeProject({ scope: 'project', projectId: project.id, confirm: 'yes' })).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED' });
  await expect(manager.removeProject({ scope: 'user', confirm: true })).rejects.toMatchObject({ code: 'USER_SCOPE_PROTECTED' });
  await expect(manager.removeProject(null)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  await expect(manager.removeProject({ scope: 'project', projectId: 'missing-project', confirm: true })).rejects.toMatchObject({ code: 'ENOENT' });
  // Entries must be cleared first, so the destructive step never takes memories with it.
  await expect(manager.removeProject({ scope: 'project', projectId: project.id, confirm: true })).rejects.toMatchObject({ code: 'PROJECT_NOT_EMPTY' });
  expect((await manager.groups()).some(group => group.id === project.id)).toBe(true);

  await expect(manager.reset({ scope: 'project', projectId: project.id, confirm: true })).resolves.toMatchObject({ removed: 1 });
  await expect(manager.removeProject({ scope: 'project', projectId: project.id, confirm: true })).resolves.toMatchObject({ warnings: [] });
  expect((await manager.groups()).some(group => group.id === project.id)).toBe(false);
  await expect(manager.project(project.id)).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(manager.removeProject({ scope: 'project', projectId: project.id, confirm: true })).rejects.toMatchObject({ code: 'ENOENT' });
  // Sibling projects and the shared user scope survive the deletion.
  expect((await manager.groups()).find(group => group.id === other.id)?.entries.map(entry => entry.name)).toEqual(['other-rule']);
  expect((await manager.groups()).find(group => group.id === 'user')?.entries).toHaveLength(1);
});
it('persists settings only as Markdown, applies all options live, and detects another window', async () => {
  const before = await manager.settings();
  const saved = await manager.updateSettings({ ...before.values, autoRecall: false, indexEnabled: false, bodyLimit: 9, debug: false }, before.hash);
  expect(config.autoRecall).toBe(false);
  expect(config.indexEnabled).toBe(false);
  expect(saved.hash).not.toBe('');
  expect((await loadSettings(Config({ memoryDir: root }))).bodyLimit).toBe(9);
  await expect(manager.updateSettings(before.values, before.hash)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
  await expect(manager.updateSettings({ memoryDir: '../other' }, saved.hash)).rejects.toMatchObject({ code: 'INVALID_SETTINGS' });
  expect(await readFile(join(root, 'SETTINGS.md'), 'utf8')).toContain('autoRecall: false');
  const files = await readdir(root, { recursive: true, withFileTypes: true });
  expect(files.filter(file => file.isFile()).every(file => file.name.endsWith('.md'))).toBe(true);
});
it('keeps loading settings written before the background extraction was removed, then drops those keys', async () => {
  await atomicMarkdown(join(root, 'SETTINGS.md'), markdown({ settings: { autoRecall: false, autoExtract: false, extractionProvider: 'old', extractionModel: 'old-model',
    extractionTimeoutMs: 45000, extractionMaxTokens: 2048, extractionMaxOperations: 9, extractionAttempts: 3, enableInHeadless: true } }, '# Legacy settings'));
  const view = await manager.settings();
  expect(view.values.autoRecall).toBe(false);
  expect('autoExtract' in view.values).toBe(false);
  const saved = await manager.updateSettings({ ...view.values, bodyLimit: 3 }, view.hash);
  expect(saved.values.bodyLimit).toBe(3);
  const content = await readFile(join(root, 'SETTINGS.md'), 'utf8');
  expect(content).not.toContain('autoExtract');
  expect(content).not.toContain('extraction');
  expect((await loadSettings(Config({ memoryDir: root }))).autoRecall).toBe(false);
});
it('pairs externally edited settings with their own hash and applies that snapshot', async () => {
  const before = await manager.settings();
  const content = markdown({ settings: { ...before.values, bodyLimit: 8, autoRecall: false } }, '# External edit');
  await atomicMarkdown(join(root, 'SETTINGS.md'), content);
  const after = await manager.settings();
  expect(after.values.bodyLimit).toBe(8);
  expect(after.hash).toBe(digest(content));
  expect(config.autoRecall).toBe(false);
  await expect(manager.updateSettings(before.values, before.hash)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
});
it('prunes cross-project grants that point at missing projects and reports them', async () => {
  const project: ProjectIdentity = { id: 'alpha-aaaaaaaaaaaaaaaa', cwd: 'C:/work/alpha', root: 'C:/work/alpha/.git', kind: 'git' };
  await store.initializeProject(project);
  const before = await manager.settings();
  const saved = await manager.updateSettings({ ...before.values, crossProject: { [project.id]: ['user'], 'ghost-1111111111111111': ['user'] } }, before.hash);
  expect(saved.stale).toContain('ghost-1111111111111111');
  expect(saved.values.crossProject).toEqual({ [project.id]: ['user'] });
  const content = await readFile(join(root, 'SETTINGS.md'), 'utf8');
  expect(content).not.toContain('ghost-1111111111111111');
  expect(content).not.toContain('recallUser');
});
it('preserves unreadable project restrictions and grants when saving unrelated settings', async () => {
  const alpha: ProjectIdentity = { id: 'alpha-aaaaaaaaaaaaaaaa', cwd: 'C:/alpha', root: 'C:/alpha', kind: 'directory' };
  const beta: ProjectIdentity = { id: 'beta-bbbbbbbbbbbbbbbb', cwd: 'C:/beta', root: 'C:/beta', kind: 'directory' };
  await store.initializeProject(alpha); await store.initializeProject(beta);
  let view = await manager.settings();
  view = await manager.updateSettings({ ...view.values, crossProject: { [alpha.id]: [], [beta.id]: [alpha.id] } }, view.hash);
  await writeFile(join(store.directory('project', alpha), 'PROJECT.md'), 'broken metadata');
  // Old clients omitted cards whose metadata could not be loaded.
  const saved = await manager.updateSettings({ ...view.values, debug: false, crossProject: { [beta.id]: [alpha.id] } }, view.hash);
  expect(saved.values.crossProject).toEqual({ [alpha.id]: [], [beta.id]: [alpha.id] });
  expect(saved.stale).not.toContain(alpha.id);
  expect(resolveAccess(alpha, [beta], saved.values.crossProject).user).toBe(false);
  await writeFile(join(store.directory('project', alpha), 'PROJECT.md'), markdown(alpha, '# Repaired project'));
  const reloaded = await loadSettings(Config({ memoryDir: root }));
  expect(resolveAccess(beta, [alpha, beta], reloaded.crossProject).granted).toEqual([alpha]);
});
