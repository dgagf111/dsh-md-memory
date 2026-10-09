import { describe, expect, it } from 'vitest';
import { DEFAULT_SOURCES, USER_SOURCE, handleMap, matchProject, normalizeMatrix, projectHandle, projectSlug, resolveAccess, sourceListFor } from '../src/access.js';
import type { ProjectIdentity } from '../src/types.js';

const project = (id: string, cwd = `C:/work/${id.replace(/-[0-9a-f]{16}$/, '')}`, root = `${cwd}/.git`): ProjectIdentity => ({ id, cwd, root, kind: 'git' });
const alpha = project('alpha-aaaaaaaaaaaaaaaa');
const beta = project('beta-bbbbbbbbbbbbbbbb');
const shared = project('alpha-cccccccccccccccc');
const all = [alpha, beta, shared];

describe('project handles', () => {
  it('derives the slug from the repository directory, matching project identity', () => {
    expect(projectSlug(alpha)).toBe('alpha');
    expect(projectSlug({ cwd: 'C:/work/plain', root: 'C:/work/plain', kind: 'directory' })).toBe('plain');
    expect(projectSlug({ cwd: 'C:/', root: 'C:/', kind: 'directory' })).toBe('project');
  });

  it('falls back to the full id when two projects share a slug', () => {
    expect(projectHandle(alpha, all)).toBe('alpha-aaaaaaaaaaaaaaaa');
    expect(projectHandle(shared, all)).toBe('alpha-cccccccccccccccc');
    expect(projectHandle(beta, all)).toBe('beta');
    expect(handleMap(all)).toEqual({ 'alpha-aaaaaaaaaaaaaaaa': 'alpha-aaaaaaaaaaaaaaaa', 'beta-bbbbbbbbbbbbbbbb': 'beta', 'alpha-cccccccccccccccc': 'alpha-cccccccccccccccc' });
  });
});

describe('normalizeMatrix', () => {
  it('keeps known grants, drops unknown ones and never throws on junk', () => {
    const { matrix, stale } = normalizeMatrix({ [alpha.id]: [USER_SOURCE, beta.id], 'ghost-0000000000000000': [USER_SOURCE], [beta.id]: 'user', [shared.id]: [beta.id, beta.id] }, all);
    expect(matrix).toEqual({ [alpha.id]: [USER_SOURCE, beta.id], [shared.id]: [beta.id] });
    expect(stale).toEqual(['ghost-0000000000000000']);
  });

  it('drops self-grants and preserves an explicit empty list', () => {
    const { matrix } = normalizeMatrix({ [alpha.id]: [alpha.id], [beta.id]: [] }, all);
    expect(matrix[alpha.id]).toEqual([]);
    expect(matrix[beta.id]).toEqual([]);
  });

  it('ignores non-object input', () => {
    for (const raw of [undefined, null, 'x', 7, []]) expect(normalizeMatrix(raw, all)).toEqual({ matrix: {}, stale: [] });
  });
});

describe('resolveAccess', () => {
  it('defaults to the fallback sources for projects missing from the matrix', () => {
    const access = resolveAccess(alpha, all, {});
    expect(access.user).toBe(true);
    expect(access.granted).toEqual([]);
    expect(sourceListFor(alpha, {}, DEFAULT_SOURCES)).toEqual([USER_SOURCE]);
  });

  it('takes the user scope from the matrix and never from a global toggle', () => {
    const access = resolveAccess(alpha, all, { [alpha.id]: [beta.id] });
    expect(access.user).toBe(false);
    expect(access.granted.map(p => p.id)).toEqual([beta.id]);
  });

  it('honours an empty source list as "sees nothing"', () => {
    const access = resolveAccess(alpha, all, { [alpha.id]: [] });
    expect(access.user).toBe(false);
    expect(access.granted).toEqual([]);
  });

  it('reports granted projects that no longer exist instead of failing', () => {
    const access = resolveAccess(alpha, all, { [alpha.id]: [USER_SOURCE, 'gone-1111111111111111'] });
    expect(access.granted).toEqual([]);
    expect(access.stale).toEqual(['gone-1111111111111111']);
  });

  it('ignores a self-grant and keeps a session without a project on the user scope', () => {
    expect(resolveAccess(alpha, all, { [alpha.id]: [alpha.id, USER_SOURCE] }).granted).toEqual([]);
    const unbound = resolveAccess(undefined, all, {});
    expect(unbound.own).toBeUndefined();
    expect(unbound.user).toBe(true);
  });
});

describe('matchProject', () => {
  const handles = handleMap(all);
  it('prefers the full id, then a unique handle', () => {
    expect(matchProject(alpha.id, all, handles).project?.id).toBe(alpha.id);
    expect(matchProject('beta', all, handles).project?.id).toBe(beta.id);
    expect(matchProject('nope', all, handles).project).toBeUndefined();
  });

  it('reports an ambiguous handle rather than guessing', () => {
    const clashing = [project('dup-1111111111111111'), project('dup-2222222222222222')];
    // handleMap() never produces duplicate handles; the guard covers a caller that does.
    const match = matchProject('dup', clashing, { [clashing[0]!.id]: 'dup', [clashing[1]!.id]: 'dup' });
    expect(match.project).toBeUndefined();
    expect(match.ambiguous?.map(p => p.id)).toEqual(['dup-1111111111111111', 'dup-2222222222222222']);
    expect(handleMap(clashing)[clashing[0]!.id]).toBe(clashing[0]!.id);
  });
});
