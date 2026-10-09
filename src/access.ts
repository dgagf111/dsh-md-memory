import { basename, join } from 'node:path';
import type { ProjectIdentity } from './types.js';

/**
 * Cross-project read grants.
 *
 * `crossProject` maps a project id to the memory blocks its sessions may read:
 * the literal `user` and/or other project ids. The project itself is always
 * visible and is never listed. A project missing from the matrix falls back to
 * `['user']` (or to the migration default derived from the removed global
 * `recallUser` toggle). Grants are read-only: nothing in this module is consulted
 * by the write, forget or extraction paths.
 */

export const USER_SOURCE = 'user';
export const DEFAULT_SOURCES: readonly string[] = [USER_SOURCE];
export const PROJECT_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export type AccessMatrix = Record<string, string[]>;

export interface ResolvedAccess {
  own?: ProjectIdentity;
  user: boolean;
  granted: ProjectIdentity[];
  /** Sources named by the matrix that no longer exist; reported, never fatal. */
  stale: string[];
}

/** Slug used by project identity and by cross-project index links. */
export function projectSlug(project: Pick<ProjectIdentity, 'root' | 'cwd' | 'kind'>): string {
  const label = project.kind === 'git' ? basename(join(project.root, '..')) : basename(project.root || project.cwd);
  return label.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'project';
}

/**
 * Display handle for a project. A slug shared by two projects is ambiguous for
 * the model, so every member of a colliding set falls back to the full id.
 */
export function projectHandle(project: ProjectIdentity, all: readonly ProjectIdentity[]): string {
  const slug = projectSlug(project);
  const collisions = all.filter(candidate => projectSlug(candidate) === slug);
  return collisions.length > 1 ? project.id : slug;
}

export function handleMap(all: readonly ProjectIdentity[]): Record<string, string> {
  return Object.fromEntries(all.map(project => [project.id, projectHandle(project, all)]));
}

/**
 * Drops missing projects, missing sources, duplicated values and self-grants.
 * Unreadable project directories retain their stored grants until repaired.
 * Never throws: a project directory can disappear long after it was granted.
 */
export function normalizeMatrix(raw: unknown, known: readonly ProjectIdentity[], unavailable: readonly string[] = []): { matrix: AccessMatrix; stale: string[] } {
  const matrix: AccessMatrix = {};
  const stale = new Set<string>();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { matrix, stale: [] };
  const ids = new Set([...known.map(project => project.id), ...unavailable.filter(id => PROJECT_ID.test(id))]);
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!ids.has(key)) { stale.add(key); continue; }
    if (!Array.isArray(value)) continue;
    const sources: string[] = [];
    for (const entry of value) {
      if (typeof entry !== 'string') continue;
      if (entry === USER_SOURCE) { if (!sources.includes(USER_SOURCE)) sources.push(USER_SOURCE); continue; }
      if (entry === key) continue; // own project is always visible
      if (!ids.has(entry)) { stale.add(entry); continue; }
      if (!sources.includes(entry)) sources.push(entry);
    }
    // Keep explicit choices, including an empty list (a project that sees nothing).
    matrix[key] = sources;
  }
  return { matrix, stale: [...stale].sort() };
}

export function sourceListFor(own: ProjectIdentity | undefined, matrix: AccessMatrix, fallback: readonly string[]): string[] {
  return own ? [...(matrix[own.id] ?? fallback)] : [...fallback];
}

export function resolveAccess(own: ProjectIdentity | undefined, known: readonly ProjectIdentity[], matrix: AccessMatrix, fallback: readonly string[] = DEFAULT_SOURCES): ResolvedAccess {
  const sources = sourceListFor(own, matrix, fallback);
  const byId = new Map(known.map(project => [project.id, project]));
  const granted: ProjectIdentity[] = [];
  const stale: string[] = [];
  for (const source of sources) {
    if (source === USER_SOURCE || source === own?.id) continue;
    const project = byId.get(source);
    if (!project) { stale.push(source); continue; }
    if (!granted.some(candidate => candidate.id === project.id)) granted.push(project);
  }
  return { own, user: sources.includes(USER_SOURCE), granted, stale };
}

export interface ProjectMatch {
  project?: ProjectIdentity;
  ambiguous?: ProjectIdentity[];
}

/** Matches a tool reference against the visible projects: full id first, then handle. */
export function matchProject(reference: string, candidates: readonly ProjectIdentity[], handles: Record<string, string>): ProjectMatch {
  const exact = candidates.find(project => project.id === reference);
  if (exact) return { project: exact };
  const byHandle = candidates.filter(project => (handles[project.id] ?? projectSlug(project)) === reference);
  if (byHandle.length === 1) return { project: byHandle[0]! };
  if (byHandle.length > 1) return { ambiguous: byHandle };
  return {};
}
