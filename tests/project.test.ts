import { it, expect } from 'vitest';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveProject } from '../src/project.js';
const run = promisify(execFile);
it('binds subdirectories/worktrees to one repository and keeps independent clones separate', async () => {
  const root = await mkdtemp(join(tmpdir(), 'md-project-'));
  const main = join(root, 'main'), worktree = join(root, 'worktree'), clone = join(root, 'clone');
  await mkdir(main); await mkdir(join(main, 'src'));
  try {
    await run('git', ['init', main]);
    await run('git', ['-C', main, '-c', 'user.name=Memory Test', '-c', 'user.email=memory@example.invalid', 'commit', '--allow-empty', '-m', 'fixture']);
    await run('git', ['-C', main, 'worktree', 'add', '-b', 'memory-test', worktree]);
    await run('git', ['clone', main, clone]);
    const identity = await resolveProject(main);
    expect((await resolveProject(join(main, 'src'))).id).toBe(identity.id);
    expect((await resolveProject(worktree)).id).toBe(identity.id);
    expect((await resolveProject(clone)).id).not.toBe(identity.id);
    expect((await resolveProject(root)).kind).toBe('directory');
  } finally { await rm(root, { recursive: true, force: true }); }
}, 20000);
