import { constants } from 'node:fs';
import { lstat, mkdir, open, readFile, rename, rm, unlink } from 'node:fs/promises';
import { dirname, join, parse, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { MemoryError } from './types.js';

export function isMissing(error: unknown): boolean { return (error as NodeJS.ErrnoException)?.code === 'ENOENT'; }

export async function assertRegularDirectory(path: string): Promise<void> {
  const absolute = resolve(path);
  const chain: string[] = [];
  for (let current = absolute; current !== parse(current).root; current = dirname(current)) chain.unshift(current);
  for (const current of chain) {
    const stat = await lstat(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new MemoryError('UNSAFE_DIRECTORY', `Expected a real directory: ${current}`);
  }
}

export async function ensureDirectory(path: string): Promise<void> {
  // Validate existing parents before mkdir so a junction cannot redirect creation.
  let parent = resolve(path);
  while (true) {
    try { await assertRegularDirectory(parent); break; }
    catch (error) { if (!isMissing(error)) throw error; parent = dirname(parent); }
  }
  await mkdir(path, { recursive: true, mode: 0o700 });
  await assertRegularDirectory(path);
}

export async function readMarkdown(path: string, limit = 128 * 1024): Promise<string> {
  await assertRegularDirectory(dirname(path));
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink()) throw new MemoryError('UNSAFE_FILE', `Expected a regular Markdown file: ${path}`);
  if (before.size > limit) throw new MemoryError('FILE_TOO_LARGE', `Markdown exceeds ${limit} bytes: ${path}`);
  const handle = await open(path, constants.O_RDONLY | (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW));
  try {
    const opened = await handle.stat();
    if (opened.ino !== before.ino || opened.dev !== before.dev) throw new MemoryError('FILE_CHANGED', `File changed while opening: ${path}`);
    const content = await handle.readFile('utf8');
    const after = await handle.stat();
    if (after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || Buffer.byteLength(content) > limit) {
      throw new MemoryError('FILE_CHANGED', `File changed while reading: ${path}`);
    }
    return content;
  } finally { await handle.close(); }
}

export async function atomicMarkdown(path: string, content: string): Promise<void> {
  if (!path.endsWith('.md')) throw new MemoryError('NOT_MARKDOWN', `Persistent file must end in .md: ${path}`);
  await ensureDirectory(dirname(path));
  const temporary = join(dirname(path), `.pending-${randomUUID()}.md`);
  const handle = await open(temporary, 'wx', 0o600);
  try { await handle.writeFile(content, 'utf8'); await handle.sync(); }
  finally { await handle.close(); }
  try {
    for (let attempt = 0; ; attempt++) {
      try { await rename(temporary, path); break; }
      catch (error) {
        if (process.platform !== 'win32' || !['EBUSY', 'EACCES', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '') || attempt >= 4) throw error;
        await delay(25 * 2 ** attempt);
      }
    }
  } catch (error) { await rm(temporary, { force: true }); throw error; }
}

export async function withDirectoryLock<T>(directory: string, run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  await ensureDirectory(directory);
  const path = join(directory, '.write-lock.md');
  const token = randomUUID();
  const started = Date.now();
  while (true) {
    signal?.throwIfAborted();
    try {
      const handle = await open(path, 'wx', 0o600);
      try { await handle.writeFile(`# Memory write lock\n\npid: ${process.pid}\ntoken: ${token}\ncreated: ${new Date().toISOString()}\n`); }
      finally { await handle.close(); }
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const content = await readFile(path, 'utf8').catch(error => { if (isMissing(error)) return ''; throw error; });
      const pid = /^pid: (\d+)$/m.exec(content)?.[1];
      if (pid) {
        try { process.kill(Number(pid), 0); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ESRCH') throw new MemoryError('STALE_LOCK', `Dead process ${pid} left a write lock. Inspect and remove ${path} before retrying.`);
          if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
        }
      }
      if (Date.now() - started > 4000) throw new MemoryError('LOCK_BUSY', `Write lock is held or incomplete: ${path}`);
      await delay(40, undefined, { signal });
    }
  }
  try { return await run(); }
  finally {
    const content = await readFile(path, 'utf8');
    if (!content.includes(`token: ${token}\n`)) throw new MemoryError('LOCK_OWNERSHIP', `Write lock ownership changed: ${path}`);
    await unlink(path);
  }
}
