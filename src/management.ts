import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-connection';
import { basename, join } from 'node:path';
import { redact } from './codec.js';
import { withDirectoryLock } from './files.js';
import { DEFAULT_SOURCES, normalizeMatrix } from './access.js';
import { Config, type PluginConfig } from './config.js';
import { MemoryError, type Memory, type ProjectIdentity, type MemoryScope, type WriteInput } from './types.js';
import type { MemoryRuntime } from './runtime.js';
import { saveSettings, settingsSnapshot, stripLegacy } from './settings.js';

export interface Group { id: string; scope: MemoryScope; label: string; project?: ProjectIdentity; entries: Omit<Memory, 'body'>[]; diagnostics: { code: string; path: string; message: string }[]; }
export class MemoryManagement {
  constructor(readonly runtime: MemoryRuntime) {}
  async project(id: string): Promise<ProjectIdentity> {
    return this.runtime.store.project(id);
  }
  async groups(): Promise<Group[]> {
    const group = async (scope: MemoryScope, project?: ProjectIdentity): Promise<Group> => {
      const snapshot = await this.runtime.store.snapshot(project, true);
      return { id: project?.id ?? 'user', scope, label: project ? basename(project.kind === 'git' ? join(project.root, '..') : project.cwd) : '用户记忆', project,
        entries: snapshot.memories.filter(m => m.scope === scope).map(({ body: _body, ...entry }) => entry),
        diagnostics: snapshot.diagnostics.filter(d => d.path.startsWith(this.runtime.store.directory(scope, project))) };
    };
    const result = [await group('user')];
    const registry = await this.runtime.store.projects();
    for (const project of registry.projects) result.push(await group('project', project));
    for (const invalid of registry.invalid) {
      result.push({ id: invalid.id, scope: 'project', label: invalid.id, entries: [], diagnostics: [{ code: 'INVALID_PROJECT', path: join(this.runtime.store.root, 'projects', invalid.id), message: redact(invalid.message) }] });
    }
    return result;
  }
  async target(scope: unknown, projectId?: unknown): Promise<{ scope: MemoryScope; project?: ProjectIdentity }> {
    if (scope === 'user') return { scope };
    if (scope !== 'project' || typeof projectId !== 'string') throw new MemoryError('INVALID_SCOPE', 'Select user scope or an existing project.');
    return { scope, project: await this.project(projectId) };
  }
  async settings() {
    return withDirectoryLock(join(this.runtime.store.root, 'settings'), async () => {
      const saved = await settingsSnapshot(this.runtime.store.root);
      if ('memoryDir' in saved.values) throw new MemoryError('INVALID_SETTINGS', 'Storage directory is configured by the DSH profile.');
      let config: PluginConfig;
      try { config = Config({ ...(this.runtime.profileConfig ?? this.runtime.config), ...stripLegacy(saved.values as Record<string, unknown>) }); }
      catch (error) { throw new MemoryError('INVALID_SETTINGS', error instanceof Error ? error.message : String(error), { cause: error }); }
      const changed = JSON.stringify(config) !== JSON.stringify(this.runtime.config);
      this.applyConfig(config);
      const { memoryDir: _directory, ...values } = config;
      const warnings = changed ? await this.runtime.refreshAll() : [];
      return { values, hash: saved.hash, root: this.runtime.store.root, warnings };
    });
  }
  private applyConfig(config: PluginConfig): void {
    Object.assign(this.runtime.config, config);
    this.runtime.scheduler.configure(config.extractionMaxOperations, config.extractionAttempts);
    if (!config.autoExtract) this.runtime.scheduler.cancelQueued();
  }
  async updateSettings(values: unknown, hash: string) {
    const registry = await this.runtime.store.projects();
    const input = values && typeof values === 'object' && !Array.isArray(values) ? { ...(values as Record<string, unknown>) } : values;
    let stale: string[] = [];
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      const rawMatrix = (input as Record<string, unknown>).crossProject ?? this.runtime.config.crossProject;
      const preserved = rawMatrix && typeof rawMatrix === 'object' && !Array.isArray(rawMatrix) ? { ...rawMatrix } : rawMatrix;
      // A client may only have rendered the valid projects. Keep the explicit
      // restrictions of unreadable directories even when its payload omits them.
      if (preserved && typeof preserved === 'object' && !Array.isArray(preserved)) {
        for (const { id } of registry.invalid) {
          if (!(id in preserved) && Object.hasOwn(this.runtime.config.crossProject, id)) {
            (preserved as Record<string, unknown>)[id] = this.runtime.config.crossProject[id];
          }
        }
      }
      const normalized = normalizeMatrix(preserved, registry.projects, registry.invalid.map(project => project.id));
      stale = normalized.stale;
      (input as Record<string, unknown>).crossProject = normalized.matrix;
    }
    await saveSettings(this.runtime.store.root, this.runtime.config, input, hash, config => this.applyConfig(config));
    // The legacy `recallUser` key is gone from SETTINGS.md once anything is saved.
    this.runtime.legacySources = [...DEFAULT_SOURCES];
    const warnings = await this.runtime.refreshAll();
    this.runtime.logger.info({ event: 'settings.saved', keys: Object.keys(input as object), stale, warnings });
    return { ...(await this.settings()), warnings, stale };
  }
  async write(data: WriteInput & { projectId?: string }) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new MemoryError('INVALID_INPUT', 'Memory must be an object.');
    const target = await this.target(data.scope, data.projectId);
    const memory = await this.runtime.store.write({ name: data.name, title: data.title, description: data.description, type: data.type, body: data.body,
      tags: data.tags, aliases: data.aliases, paths: data.paths, pinned: data.pinned, status: data.status,
      expectedRevision: data.expectedRevision, expectedHash: data.expectedHash,
      scope: target.scope, source: { kind: 'explicit-user', session: 'memory-page', turn: 0 } }, target.project);
    return { memory, warnings: await this.runtime.refreshAll() };
  }
  async forget(data: { scope: string; projectId?: string; name: string; revision: number; hash: string }) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new MemoryError('INVALID_INPUT', 'Delete request must be an object.');
    if (!Number.isInteger(data.revision) || typeof data.hash !== 'string') throw new MemoryError('REVISION_CONFLICT', 'Read the memory before deleting.');
    const target = await this.target(data.scope, data.projectId);
    await this.runtime.store.forget(target.scope, data.name, target.project, undefined, { revision: data.revision, hash: data.hash });
    return { warnings: await this.runtime.refreshAll() };
  }
  async move(data: { scope?: unknown; projectId?: unknown; toScope?: unknown; toProjectId?: unknown; name?: unknown; revision?: unknown; hash?: unknown }) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new MemoryError('INVALID_INPUT', 'Move request must be an object.');
    const revision = data.revision;
    if (typeof data.name !== 'string' || typeof revision !== 'number' || !Number.isInteger(revision) || typeof data.hash !== 'string') throw new MemoryError('REVISION_CONFLICT', 'Read the memory before moving it.');
    const from = await this.target(data.scope, data.projectId);
    const to = await this.target(data.toScope, data.toProjectId);
    const memory = await this.runtime.store.move(data.name, from, to, { revision, hash: data.hash });
    return { memory, warnings: await this.runtime.refreshAll() };
  }
}
export function registerManagement(ctx: Context, runtime: MemoryRuntime): void {
  const connection = ctx.get('connection');
  if (!connection) throw new MemoryError('MISSING_CONNECTION', 'Management page requires the DSH connection service.');
  const management = new MemoryManagement(runtime);
  const route = (path: string, methods: ('GET' | 'POST')[], handler: (request: Request) => Promise<unknown>) => {
    connection.fetch.register({ path: `/api/md-memory/${path}`, methods, requestBody: 'buffered', fetch: async request => {
      try { return Response.json(await handler(request), { headers: { 'cache-control': 'no-store' } }); }
      catch (error) {
        const code = error instanceof MemoryError ? error.code : (error as NodeJS.ErrnoException).code ?? 'INTERNAL_ERROR';
        runtime.logger.error({ event: 'management.request_failed', route: path, code }, error);
        const status = code === 'REVISION_CONFLICT' || code === 'NAME_CONFLICT' ? 409 : code === 'ENOENT' ? 404 : error instanceof MemoryError || error instanceof SyntaxError ? 400 : 500;
        return Response.json({ code, message: redact(error instanceof Error ? error.message : String(error)) }, { status });
      }
    } });
  };
  route('groups', ['GET'], () => management.groups());
  route('read', ['GET'], async request => {
    const params = new URL(request.url).searchParams;
    const target = await management.target(params.get('scope'), params.get('projectId'));
    return runtime.store.read(target.scope, params.get('name') ?? '', target.project);
  });
  route('write', ['POST'], async request => management.write(await request.json()));
  route('forget', ['POST'], async request => management.forget(await request.json()));
  route('move', ['POST'], async request => management.move(await request.json()));
  route('settings', ['GET', 'POST'], async request => {
    if (request.method === 'GET') return management.settings();
    const data = await request.json(); return management.updateSettings(data.values, data.hash);
  });
  runtime.logger.info({ event: 'management.registered', routes: 6, operations: 7 });
}
