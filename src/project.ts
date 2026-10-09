import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { realpath } from 'node:fs/promises';
import { projectSlug } from './access.js';
import { digest } from './codec.js';
import { MemoryError, type ProjectIdentity } from './types.js';
const execute = promisify(execFile);
export async function resolveProject(cwd: string, signal?: AbortSignal): Promise<ProjectIdentity> {
  const root = await realpath(resolve(cwd));
  let identityPath = root;
  let kind: ProjectIdentity['kind'] = 'directory';
  try {
    const result = await execute('git', ['-C', root, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { signal, timeout: 5000 });
    identityPath = await realpath(result.stdout.trim()); kind = 'git';
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { stderr?: string; killed?: boolean };
    if (!(failure.code === 'ENOENT' || failure.stderr?.includes('not a git repository'))) throw new MemoryError('PROJECT_RESOLUTION', `Could not resolve project: ${root}`, { cause: error });
  }
  const normalized = process.platform === 'win32' ? identityPath.toLowerCase() : identityPath;
  const slug = projectSlug({ root: identityPath, cwd: root, kind });
  return { id: `${slug}-${digest(normalized).slice(0, 16)}`, cwd: root, root: identityPath, kind };
}
