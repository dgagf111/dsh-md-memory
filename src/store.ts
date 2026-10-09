import { readdir, rm } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { assertRegularDirectory, atomicMarkdown, isMissing, readMarkdown, withDirectoryLock } from './files.js';
import { decodeMemory, digest, encodeMemory, markdown, parseFrontmatter, validateName, validateWrite } from './codec.js';
import { PROJECT_ID, USER_SOURCE } from './access.js';
import { MemoryError, type Checkpoint, type Logger, type Memory, type MemoryPlace, type MemoryScope, type ProjectIdentity, type Snapshot, type WriteInput } from './types.js';

interface Transaction { operation: string; action: 'write' | 'forget'; name: string; expectedHash?: string; content?: string; forgottenAt?: string; }
/** Every project directory known to this memory root, valid ones and broken ones. */
export interface ProjectRegistry { projects: ProjectIdentity[]; invalid: { id: string; message: string }[]; }
export class MemoryStore {
  constructor(readonly root: string, readonly logger: Logger) {}
  directory(scope: MemoryScope, project?: ProjectIdentity): string {
    if (scope === 'user') return join(this.root, 'user');
    if (!project || !PROJECT_ID.test(project.id)) throw new MemoryError('NO_PROJECT', 'A trusted session working directory is required for project memory.');
    return join(this.root, 'projects', project.id);
  }
  /** Reads and validates one project directory's PROJECT.md. */
  async project(id: string): Promise<ProjectIdentity> {
    if (!PROJECT_ID.test(id)) throw new MemoryError('INVALID_PROJECT', 'Invalid project identifier.');
    const data = parseFrontmatter(await readMarkdown(join(this.root, 'projects', id, 'PROJECT.md'))).metadata;
    if (data.id !== id || typeof data.cwd !== 'string' || typeof data.root !== 'string' || !['git', 'directory'].includes(String(data.kind))) throw new MemoryError('INVALID_PROJECT', `Invalid PROJECT.md for ${id}.`);
    return data as unknown as ProjectIdentity;
  }
  /** Enumerates project scopes for the management page and for cross-project grants. */
  async projects(): Promise<ProjectRegistry> {
    const registry: ProjectRegistry = { projects: [], invalid: [] };
    let ids: string[];
    try { ids = (await readdir(join(this.root, 'projects'))).sort(); }
    catch (error) { if (isMissing(error)) return registry; throw error; }
    for (const id of ids) {
      try { registry.projects.push(await this.project(id)); }
      catch (error) {
        if (!(error instanceof MemoryError) && !isMissing(error)) throw error;
        registry.invalid.push({ id, message: error instanceof Error ? error.message : String(error) });
        this.logger.error({ event: 'project.invalid', project: id }, error);
      }
    }
    return registry;
  }
  async initializeProject(project: ProjectIdentity): Promise<void> {
    const directory = this.directory('project', project);
    await withDirectoryLock(directory, async () => {
      const path = join(directory, 'PROJECT.md');
      const prior = await this.optional(path);
      if (!prior) await atomicMarkdown(path, markdown(project, '# Project identity\nDerived from the session working directory.'));
      else if (parseFrontmatter(prior).metadata.root !== project.root) throw new MemoryError('PROJECT_COLLISION', `Project identity path mismatch: ${path}`);
      await this.recover(directory, 'project');
    });
  }
  private async optional(path: string): Promise<string | undefined> {
    try { return await readMarkdown(path); } catch (error) { if (isMissing(error)) return; throw error; }
  }
  private async files(directory: string): Promise<string[]> {
    try { return await readdir(directory); } catch (error) { if (isMissing(error)) return []; throw error; }
  }
  async snapshot(project?: ProjectIdentity, includeDisabled = false, extra: readonly ProjectIdentity[] = []): Promise<Snapshot> {
    const result: Snapshot = { memories: [], diagnostics: [] };
    const targets: { scope: MemoryScope; project?: ProjectIdentity; sourceKey: string }[] = [{ scope: 'user', sourceKey: USER_SOURCE }];
    if (project) targets.push({ scope: 'project', project, sourceKey: project.id });
    const seen = new Set(targets.map(target => target.sourceKey));
    for (const granted of extra) {
      if (seen.has(granted.id)) continue;
      seen.add(granted.id);
      targets.push({ scope: 'project', project: granted, sourceKey: granted.id });
    }
    for (const target of targets) {
      const directory = this.directory(target.scope, target.project);
      for (const file of (await this.files(directory)).sort()) {
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(file)) continue;
        const path = join(directory, file);
        try {
          const memory = decodeMemory(await readMarkdown(path), target.scope, file.slice(0, -3), path, target.sourceKey);
          if (includeDisabled || memory.status === 'active') result.memories.push(memory);
        } catch (error) {
          if (isMissing(error)) continue; // A concurrent forget may remove a discovered file.
          if (!(error instanceof MemoryError)) throw error;
          result.diagnostics.push({ code: error.code, path, message: error.message });
          this.logger.error({ event: 'memory.invalid_file', code: error.code, path }, error);
        }
      }
    }
    return result;
  }
  async read(scope: MemoryScope, name: string, project?: ProjectIdentity): Promise<Memory> {
    validateName(name);
    const path = join(this.directory(scope, project), `${name}.md`);
    const memory = decodeMemory(await readMarkdown(path), scope, name, path, scope === 'user' ? USER_SOURCE : project?.id);
    this.logger.info({ event: 'memory.read', scope, name, revision: memory.revision, project: project?.id });
    return memory;
  }
  async write(input: WriteInput, project?: ProjectIdentity, signal?: AbortSignal): Promise<Memory> {
    validateWrite(input);
    const directory = this.directory(input.scope, project);
    const operation = input.operationId ?? randomUUID();
    try {
      return await withDirectoryLock(directory, async () => {
        await this.recover(directory, input.scope);
        signal?.throwIfAborted();
        const path = join(directory, `${input.name}.md`);
        const previous = await this.optional(path);
        const old = previous ? decodeMemory(previous, input.scope, input.name, path) : undefined;
        if (old?.operationId === operation) return old;
        if (old && (input.expectedRevision !== old.revision || input.expectedHash !== old.hash)) {
          throw new MemoryError('REVISION_CONFLICT', `Read ${input.scope}/${input.name} and supply its current revision and hash before updating.`);
        }
        if (!old && input.expectedRevision !== undefined && input.expectedRevision !== 0) throw new MemoryError('REVISION_CONFLICT', 'Memory no longer exists.');
        const tombstone = await this.optional(join(directory, 'forgotten', `${input.name}.md`));
        if (tombstone && input.source.kind !== 'explicit-user') {
          const forgotten = String(parseFrontmatter(tombstone).metadata.forgottenAt);
          if (!input.observedAt || input.observedAt <= forgotten) throw new MemoryError('FORGOTTEN_MEMORY', `Old extraction cannot restore forgotten memory ${input.name}.`);
          // A later window still needs explicit user intent; automatic inference cannot undo forgetting.
          throw new MemoryError('FORGOTTEN_MEMORY', `Use an explicit write to remember ${input.name} again.`);
        }
        const now = new Date().toISOString();
        const sourceKey = input.scope === 'user' ? USER_SOURCE : project!.id;
        const value: Omit<Memory, 'filePath' | 'hash'> = {
          id: old?.id ?? `${input.scope}:${input.name}`, name: input.name, title: input.title, description: input.description,
          type: input.type, scope: input.scope, body: input.body, tags: input.tags ?? [], aliases: input.aliases ?? [], paths: input.paths ?? [],
          created: old?.created ?? now, modified: now, revision: (old?.revision ?? 0) + 1,
          pinned: input.pinned ?? old?.pinned ?? false, status: input.status ?? old?.status ?? 'active', source: input.source, operationId: operation, sourceKey,
        };
        const content = encodeMemory(value);
        if (Buffer.byteLength(content) > 128 * 1024) throw new MemoryError('FILE_TOO_LARGE', 'Memory document exceeds 128 KiB. Split it before writing.');
        // Validate the exact final Markdown before any history/journal/body is persisted.
        const memory = decodeMemory(content, input.scope, input.name, path, sourceKey);
        if (old && previous) await atomicMarkdown(join(directory, 'history', input.name, `${old.revision}-${old.hash.slice(0, 12)}.md`), previous);
        const transaction: Transaction = { operation, action: 'write', name: input.name, content, ...(old ? { expectedHash: old.hash } : {}) };
        await this.commit(directory, transaction);
        this.logger.info({ event: 'memory.write_committed', operation, scope: input.scope, name: input.name, revision: memory.revision, project: project?.id, bytes: Buffer.byteLength(content), source: input.source });
        return memory;
      }, signal);
    } catch (error) { this.logger.error({ event: 'memory.write_failed', operation, scope: input.scope, name: input.name, project: project?.id }, error); throw error; }
  }
  async forget(scope: MemoryScope, name: string, project?: ProjectIdentity, signal?: AbortSignal, expected?: { revision: number; hash: string }): Promise<void> {
    validateName(name);
    const directory = this.directory(scope, project);
    const operation = randomUUID();
    await withDirectoryLock(directory, async () => {
      await this.recover(directory, scope);
      signal?.throwIfAborted();
      if (expected) {
        const current = await this.read(scope, name, project);
        if (current.revision !== expected.revision || current.hash !== expected.hash) throw new MemoryError('REVISION_CONFLICT', 'Memory changed since it was opened. Reload before deleting.');
      }
      await this.commit(directory, { operation, action: 'forget', name, forgottenAt: new Date().toISOString() });
      this.logger.info({ event: 'memory.forget_committed', operation, name, scope, project: project?.id });
    }, signal);
  }
  /**
   * Moves one memory to another scope: user, another project, or this project.
   * Content, name, creation date and revision survive; an existing entry with the
   * same name in the destination is never overwritten. The source keeps a
   * forgotten marker so background extraction cannot write the old entry back.
   */
  async move(name: string, from: MemoryPlace, to: MemoryPlace, expected?: { revision: number; hash: string }, signal?: AbortSignal): Promise<Memory> {
    validateName(name);
    const fromDirectory = this.directory(from.scope, from.project);
    const toDirectory = this.directory(to.scope, to.project);
    if (fromDirectory === toDirectory) throw new MemoryError('SAME_TARGET', 'Source and destination scopes are the same memory scope.');
    const operation = randomUUID();
    // Two directories are always locked in path order, so opposite moves cannot deadlock.
    const [first, second] = [fromDirectory, toDirectory].sort() as [string, string];
    try {
      return await withDirectoryLock(first, () => withDirectoryLock(second, async () => {
        await this.recover(fromDirectory, from.scope);
        await this.recover(toDirectory, to.scope);
        signal?.throwIfAborted();
        const memory = await this.read(from.scope, name, from.project);
        if (expected && (memory.revision !== expected.revision || memory.hash !== expected.hash)) {
          throw new MemoryError('REVISION_CONFLICT', `Read ${from.scope}/${name} and supply its current revision and hash before moving it.`);
        }
        const targetPath = join(toDirectory, `${name}.md`);
        if (await this.optional(targetPath)) throw new MemoryError('NAME_CONFLICT', `The destination scope already has a memory named ${name}. Rename or delete it before moving.`);
        const sourceKey = to.scope === 'user' ? USER_SOURCE : to.project!.id;
        const value: Omit<Memory, 'filePath' | 'hash'> = {
          id: `${to.scope}:${name}`, name, title: memory.title, description: memory.description, type: memory.type, scope: to.scope, body: memory.body,
          tags: memory.tags, aliases: memory.aliases, paths: memory.paths, created: memory.created, modified: new Date().toISOString(), revision: memory.revision,
          pinned: memory.pinned, status: memory.status, source: { kind: 'explicit-user', session: 'memory-page', turn: 0 }, operationId: operation, sourceKey,
        };
        const content = encodeMemory(value);
        if (Buffer.byteLength(content) > 128 * 1024) throw new MemoryError('FILE_TOO_LARGE', 'Memory document exceeds 128 KiB. Split it before moving.');
        const moved = decodeMemory(content, to.scope, name, targetPath, sourceKey);
        await this.commit(toDirectory, { operation, action: 'write', name, content });
        try {
          await this.commit(fromDirectory, { operation: randomUUID(), action: 'forget', name, forgottenAt: new Date().toISOString() });
        } catch (error) {
          // The move must not leave two live copies: undo the destination write if the source cannot be released.
          try {
            const current = await this.optional(targetPath);
            if (current && digest(current) === digest(content)) { await rm(targetPath, { force: true }); await this.rebuildIndex(toDirectory); }
          } catch (rollback) { this.logger.error({ event: 'memory.move_rollback_failed', operation, name, to: sourceKey }, rollback); }
          this.logger.error({ event: 'memory.move_failed', operation, name, from: from.project?.id, to: sourceKey }, error);
          throw error;
        }
        this.logger.info({ event: 'memory.move_committed', operation, name, from: from.scope, fromProject: from.project?.id, to: to.scope, toProject: to.project?.id, revision: moved.revision, bytes: Buffer.byteLength(content) });
        return moved;
      }), signal);
    } catch (error) {
      if (!(error instanceof MemoryError && error.code === 'REVISION_CONFLICT')) this.logger.error({ event: 'memory.move_rejected', operation, name, from: from.project?.id, to: to.project?.id }, error);
      throw error;
    }
  }
  private async commit(directory: string, transaction: Transaction): Promise<void> {
    const path = join(directory, 'transactions', `${transaction.operation}.md`);
    await atomicMarkdown(path, markdown(transaction, '# Pending memory operation'));
    try {
      await this.applyTransaction(directory, transaction);
      await this.rebuildIndex(directory);
      await rm(path);
    } catch (error) { throw new MemoryError('COMMIT_INCOMPLETE', `Memory transaction is incomplete; body may already be saved. Inspect pending journal ${path} before retrying.`, { cause: error }); }
  }
  private async applyTransaction(directory: string, transaction: Transaction): Promise<void> {
    validateName(transaction.name);
    const path = join(directory, `${transaction.name}.md`);
    if (transaction.action === 'write') {
      if (!transaction.content) throw new MemoryError('INVALID_TRANSACTION', 'Write transaction has no content.');
      const current = await this.optional(path);
      if (current !== transaction.content) {
        if ((current ? digest(current) : undefined) !== transaction.expectedHash) throw new MemoryError('RECOVERY_CONFLICT', `Pending transaction conflicts with current file: ${path}`);
        await atomicMarkdown(path, transaction.content);
      }
      const source = parseFrontmatter(transaction.content).metadata.source as { kind?: string } | undefined;
      if (source?.kind === 'explicit-user') await rm(join(directory, 'forgotten', `${transaction.name}.md`), { force: true });
    } else if (transaction.action === 'forget') {
      await atomicMarkdown(join(directory, 'forgotten', `${transaction.name}.md`), markdown({ name: transaction.name, forgottenAt: transaction.forgottenAt, operation: transaction.operation }, '# Forgotten memory\nNo original content is retained.'));
      await rm(path, { force: true });
      const history = resolve(directory, 'history', transaction.name);
      const contained = relative(resolve(directory), history);
      if (contained.startsWith('..') || isAbsolute(contained)) throw new MemoryError('UNSAFE_DIRECTORY', 'History deletion escaped memory scope.');
      try { await assertRegularDirectory(history); await rm(history, { recursive: true }); }
      catch (error) { if (!isMissing(error)) throw error; }
      for (const file of await this.files(join(directory, 'transactions'))) {
        if (!file.endsWith('.md') || file === `${transaction.operation}.md`) continue;
        const sibling = join(directory, 'transactions', file);
        const metadata = parseFrontmatter(await readMarkdown(sibling)).metadata;
        if (metadata.name === transaction.name) await rm(sibling);
      }
    } else throw new MemoryError('INVALID_TRANSACTION', 'Unknown transaction action.');
  }
  private async recover(directory: string, scope: MemoryScope): Promise<void> {
    for (const file of (await this.files(join(directory, 'transactions'))).sort()) {
      if (!file.endsWith('.md') || file.startsWith('.')) continue;
      const path = join(directory, 'transactions', file);
      const transaction = parseFrontmatter(await readMarkdown(path)).metadata as unknown as Transaction;
      this.logger.info({ event: 'memory.recovery_started', scope, operation: transaction.operation, name: transaction.name });
      await this.applyTransaction(directory, transaction);
      await this.rebuildIndex(directory);
      await rm(path);
      this.logger.info({ event: 'memory.recovery_committed', scope, operation: transaction.operation });
    }
  }
  private async rebuildIndex(directory: string): Promise<void> {
    const lines: string[] = [];
    for (const file of (await this.files(directory)).sort()) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(file)) continue;
      let memory: Memory;
      try { memory = decodeMemory(await readMarkdown(join(directory, file)), 'user', file.slice(0, -3), join(directory, file)); }
      catch (error) {
        if (!(error instanceof MemoryError)) throw error;
        this.logger.error({ event: 'index.invalid_file', path: join(directory, file), code: error.code }, error);
        continue;
      }
      if (memory.status === 'disabled') continue;
      const title = memory.title.replace(/[\r\n\[\]]/g, ' ');
      const description = memory.description.replace(/[\r\n]/g, ' ');
      lines.push(`- [${title}](${file}) — ${description}`);
    }
    await atomicMarkdown(join(directory, 'MEMORY.md'), `# Memory index\n\n${lines.join('\n')}\n`);
  }
  async recoverAll(project?: ProjectIdentity): Promise<void> {
    for (const scope of project ? ['user', 'project'] as const : ['user'] as const) {
      const directory = this.directory(scope, project);
      if ((await this.files(join(directory, 'transactions'))).some(file => file.endsWith('.md') && !file.startsWith('.'))) {
        await withDirectoryLock(directory, () => this.recover(directory, scope));
      }
    }
  }
  private checkpointPath(project: ProjectIdentity | undefined, session: string): string {
    const directory = project ? this.directory('project', project) : join(this.root, 'user');
    return join(directory, 'state', `${digest(session).slice(0, 24)}.md`);
  }
  async checkpoint(project: ProjectIdentity | undefined, session: string): Promise<Checkpoint> {
    const content = await this.optional(this.checkpointPath(project, session));
    if (!content) return { boundary: -1 };
    const value = parseFrontmatter(content).metadata as unknown as Checkpoint;
    if (!Number.isInteger(value.boundary)) throw new MemoryError('INVALID_CHECKPOINT', 'Malformed extraction checkpoint.');
    return value;
  }
  async saveCheckpoint(project: ProjectIdentity | undefined, session: string, checkpoint: Checkpoint): Promise<void> {
    const path = this.checkpointPath(project, session);
    const directory = project ? this.directory('project', project) : this.directory('user');
    await withDirectoryLock(directory, async () => {
      const prior = await this.checkpoint(project, session);
      if (prior.boundary > checkpoint.boundary) return;
      await atomicMarkdown(path, markdown(checkpoint, '# Extraction checkpoint'));
    });
  }
}
