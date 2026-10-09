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
export declare const USER_SOURCE = "user";
export declare const DEFAULT_SOURCES: readonly string[];
export declare const PROJECT_ID: RegExp;
export type AccessMatrix = Record<string, string[]>;
export interface ResolvedAccess {
    own?: ProjectIdentity;
    user: boolean;
    granted: ProjectIdentity[];
    /** Sources named by the matrix that no longer exist; reported, never fatal. */
    stale: string[];
}
/** Slug used by project identity and by cross-project index links. */
export declare function projectSlug(project: Pick<ProjectIdentity, 'root' | 'cwd' | 'kind'>): string;
/**
 * Display handle for a project. A slug shared by two projects is ambiguous for
 * the model, so every member of a colliding set falls back to the full id.
 */
export declare function projectHandle(project: ProjectIdentity, all: readonly ProjectIdentity[]): string;
export declare function handleMap(all: readonly ProjectIdentity[]): Record<string, string>;
/**
 * Drops missing projects, missing sources, duplicated values and self-grants.
 * Unreadable project directories retain their stored grants until repaired.
 * Never throws: a project directory can disappear long after it was granted.
 */
export declare function normalizeMatrix(raw: unknown, known: readonly ProjectIdentity[], unavailable?: readonly string[]): {
    matrix: AccessMatrix;
    stale: string[];
};
export declare function sourceListFor(own: ProjectIdentity | undefined, matrix: AccessMatrix, fallback: readonly string[]): string[];
export declare function resolveAccess(own: ProjectIdentity | undefined, known: readonly ProjectIdentity[], matrix: AccessMatrix, fallback?: readonly string[]): ResolvedAccess;
export interface ProjectMatch {
    project?: ProjectIdentity;
    ambiguous?: ProjectIdentity[];
}
/** Matches a tool reference against the visible projects: full id first, then handle. */
export declare function matchProject(reference: string, candidates: readonly ProjectIdentity[], handles: Record<string, string>): ProjectMatch;
