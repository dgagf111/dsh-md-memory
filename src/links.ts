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
export const LINK_LIMIT = 20;
/** Characters of the target's description kept as a hint. */
export const LINK_DESCRIPTION_LIMIT = 120;

const LINK = /\[\[([a-z0-9]+(?:-[a-z0-9]+)*)\]\]/g;

/** Inline code and fenced blocks are literal text: a link written there is an example, not a link. */
function withoutCode(body: string): string {
  return body.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ');
}

/**
 * Unique link targets in body order. Names that cannot be a memory name and
 * repeats are dropped, so the caller never sees a target twice. Text inside
 * inline or fenced code is ignored - that is where prose documents the syntax
 * itself.
 */
export function extractLinks(body: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const match of withoutCode(body).matchAll(LINK)) {
    const name = match[1]!;
    if (name.length > 64 || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

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
export function resolveLinks(
  names: readonly string[],
  candidates: readonly Memory[],
  rank: (memory: Memory) => number,
  locate: (memory: Memory) => { project?: string },
): LinkResolution {
  const limited = names.slice(0, LINK_LIMIT);
  const related = limited.map((name): RelatedLink => {
    const hits = candidates.filter(candidate => candidate.name === name);
    if (hits.length === 0) return { name, exists: false };
    const best = [...hits].sort((left, right) => rank(left) - rank(right))[0]!;
    return {
      name,
      exists: true,
      scope: best.scope,
      ...locate(best),
      ...hint(best.description),
      ...(hits.length > 1 ? { ambiguous: true } : {}),
    };
  });
  return { related, omitted: names.length - limited.length };
}

function hint(description: string): { description?: string } {
  const text = description.replace(/\s+/g, ' ').trim();
  if (text === '') return {};
  return { description: text.length > LINK_DESCRIPTION_LIMIT ? `${text.slice(0, LINK_DESCRIPTION_LIMIT - 1)}…` : text };
}
