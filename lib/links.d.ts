/**
 * `[[name]]` links inside memory bodies.
 *
 * The convention comes from the Claude Code / ZCode memory family: an entry
 * points at a related entry by name instead of copying its text. Nothing stores
 * or expands that relation, so a link is only as good as the name it carries:
 * a renamed or forgotten target leaves a silent dead link. `md_memory_read`
 * therefore resolves the links of the body it just returned against everything
 * the session can read and reports whether each target exists - without
 * injecting any other body, and without spending more than a short hint per
 * link.
 */
import type { Memory, MemoryScope } from './types.js';
/** Most links reported for one read. Further links are counted in `omitted`. */
export declare const LINK_LIMIT = 20;
/** Characters of the target's description kept as a hint. */
export declare const LINK_DESCRIPTION_LIMIT = 120;
/**
 * Unique link targets in body order. Names that cannot be a memory name and
 * repeats are dropped, so the caller never sees a target twice. Text inside
 * inline or fenced code is ignored - that is where prose documents the syntax
 * itself.
 */
export declare function extractLinks(body: string): string[];
/** Object-literal type aliases (not interfaces) so the values stay assignable to the tool JSON contract. */
export type RelatedLink = {
    name: string;
    exists: boolean;
    scope?: MemoryScope;
    /** Index label of the project the target lives in; absent for the user scope. */
    project?: string;
    description?: string;
    /** The same name is readable from more than one block; the closest one is reported. */
    ambiguous?: boolean;
};
export type LinkResolution = {
    related: RelatedLink[];
    omitted: number;
};
/**
 * Resolves targets against the readable blocks. A name can exist in several
 * blocks, so `rank` orders the candidates and the smallest rank wins: the
 * entry's own block first, then the current project, the user scope and any
 * granted project.
 */
export declare function resolveLinks(names: readonly string[], candidates: readonly Memory[], rank: (memory: Memory) => number, locate: (memory: Memory) => {
    project?: string;
}): LinkResolution;
