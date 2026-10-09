import { describe, expect, it } from 'vitest';
import { LINK_DESCRIPTION_LIMIT, LINK_LIMIT, extractLinks, resolveLinks } from '../src/links.js';
import type { Memory, MemorySource, MemoryType } from '../src/types.js';

let sequence = 0;
function memory(partial: Partial<Memory> & { name: string }): Memory {
  sequence += 1;
  const scope = partial.scope ?? 'project';
  const stamp = '2026-01-01T00:00:00Z';
  return {
    id: `mem-${partial.name}-${sequence}`,
    name: partial.name,
    title: partial.title ?? partial.name,
    description: partial.description ?? '',
    type: partial.type ?? ('project' as MemoryType),
    scope,
    body: partial.body ?? '',
    tags: partial.tags ?? [],
    aliases: partial.aliases ?? [],
    paths: partial.paths ?? [],
    created: stamp,
    modified: stamp,
    revision: partial.revision ?? 1,
    pinned: false,
    status: 'active',
    source: partial.source ?? ({ session: 'session-1', turn: 1, kind: 'explicit-user' } as MemorySource),
    filePath: `/store/${scope}/${partial.name}.md`,
    hash: partial.hash ?? 'hash-1',
    sourceKey: partial.sourceKey ?? (scope === 'user' ? 'user' : 'project-own'),
  };
}

describe('extractLinks', () => {
  it('reads targets in body order and reports a repeat once', () => {
    expect(extractLinks('先看 [[alpha]]，再看 [[beta-one]]，[[alpha]] 前面已经提过')).toEqual(['alpha', 'beta-one']);
  });

  it('ignores text that cannot be a memory name', () => {
    expect(extractLinks('[[Alpha]] [[a b]] [[-bad]] [[bad-]] [[ ]] [[a_b]] [single] [[未闭合]] [x](y)')).toEqual([]);
  });

  it('accepts a 64-character name and rejects a longer one', () => {
    const longest = 'a'.repeat(64);
    expect(extractLinks(`[[${longest}]]`)).toEqual([longest]);
    expect(extractLinks(`[[${'a'.repeat(65)}]]`)).toEqual([]);
  });

  it('returns nothing for a body without links', () => {
    expect(extractLinks('没有任何互链的正文。')).toEqual([]);
  });

  it('ignores links written inside inline or fenced code', () => {
    const body = '用 `[[name]]` 这种写法互链：\n\n```\n[[fenced-example]]\n```\n\n真正要链的是 [[real-entry]]。';
    expect(extractLinks(body)).toEqual(['real-entry']);
  });
});

describe('resolveLinks', () => {
  const own = 'project-own';
  const rank = (candidate: Memory) => candidate.sourceKey === own ? 0 : candidate.scope === 'user' ? 1 : 2;
  const locate = (candidate: Memory) => candidate.scope === 'project' ? { project: candidate.sourceKey } : {};

  it('marks a target that no readable block owns', () => {
    const result = resolveLinks(['ghost'], [memory({ name: 'manual-rule' })], rank, locate);
    expect(result.related).toEqual([{ name: 'ghost', exists: false }]);
    expect(result.omitted).toBe(0);
  });

  it('reports the block a target lives in and a short description hint', () => {
    const result = resolveLinks(['manual-rule'], [memory({ name: 'manual-rule', description: '本项目只使用 Markdown 存储。' })], rank, locate);
    expect(result.related).toEqual([{ name: 'manual-rule', exists: true, scope: 'project', project: own, description: '本项目只使用 Markdown 存储。' }]);
  });

  it('prefers the closest block when several share the name', () => {
    const result = resolveLinks(['shared'], [
      memory({ name: 'shared', scope: 'user', sourceKey: 'user', description: '用户作用域的那条' }),
      memory({ name: 'shared', sourceKey: 'granted-project', description: '别的项目那条' }),
      memory({ name: 'shared', sourceKey: own, description: '本项目那条' }),
    ], rank, locate);
    expect(result.related[0]).toMatchObject({ name: 'shared', exists: true, scope: 'project', project: own, ambiguous: true });
  });

  it('flags the user scope without inventing a project label', () => {
    const result = resolveLinks(['pref'], [memory({ name: 'pref', scope: 'user', sourceKey: 'user' })], rank, locate);
    expect(result.related[0]).toEqual({ name: 'pref', exists: true, scope: 'user' });
  });

  it('caps the list and counts what it left out', () => {
    const names = Array.from({ length: LINK_LIMIT + 5 }, (_, index) => `entry-${index}`);
    const result = resolveLinks(names, [], rank, locate);
    expect(result.related).toHaveLength(LINK_LIMIT);
    expect(result.omitted).toBe(5);
  });

  it('keeps a long description within the hint limit and collapses whitespace', () => {
    const description = `第一行\n\n第二行 ${'字'.repeat(LINK_DESCRIPTION_LIMIT * 2)}`;
    const result = resolveLinks(['long'], [memory({ name: 'long', description })], rank, locate);
    const hint = result.related[0]!.description!;
    expect(hint.length).toBe(LINK_DESCRIPTION_LIMIT);
    expect(hint.endsWith('…')).toBe(true);
    expect(hint.includes('\n')).toBe(false);
  });
});
