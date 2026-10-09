import { describe, expect, it } from 'vitest';
import { CROSS_PROJECT_SHARE, escapeContext, rankMemories, renderBodies, renderIndex } from '../src/retrieval.js';
import type { Memory, MemoryType, RankedMemory, RetrievalQuery } from '../src/types.js';

let sequence = 0;

function memory(partial: Partial<Memory> & { name: string; title: string }): Memory {
  sequence += 1;
  const scope = partial.scope ?? 'project';
  const stamp = '2026-01-01T00:00:00Z';
  return {
    id: partial.id ?? `mem-${partial.name}-${sequence}`,
    name: partial.name,
    title: partial.title,
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
    pinned: partial.pinned ?? false,
    status: partial.status ?? 'active',
    source: partial.source ?? { session: 'session-1', turn: 1, kind: 'explicit-user' },
    filePath: partial.filePath ?? `/store/${scope}/${partial.name}.md`,
    hash: partial.hash ?? 'hash-1',
    sourceKey: partial.sourceKey ?? (scope === 'user' ? 'user' : 'store-project'),
  };
}

function query(current: string, recent: string[] = [], touchedPaths: string[] = []): RetrievalQuery {
  return { current, recent, touchedPaths };
}

function bytesOf(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

function find(ranked: RankedMemory[], name: string): RankedMemory {
  const hit = ranked.find((entry) => entry.memory.name === name);
  expect(hit, `expected ${name} in the ranking`).toBeDefined();
  return hit!;
}

describe('rankMemories channel weighting', () => {
  const memories = [
    memory({
      name: 'rc-alpha-compat',
      title: '兼容 RC 和 Alpha',
      description: '插件接口兼容 RC 与 Alpha 两条线',
      body: 'RC 与 Alpha 的接口兼容由同一适配层保证。',
      tags: ['接口', '兼容'],
    }),
    memory({ name: 'memory-index', title: '记忆索引与按需召回', description: '索引与按需召回的正文预算' }),
    memory({ name: 'use-pnpm', title: '使用 pnpm', description: '依赖安装统一使用 pnpm', body: '包管理器统一使用 pnpm。' }),
  ];

  it('ranks the memory matching the Chinese query first', () => {
    const ranked = rankMemories(memories, query('检查 RC 和 Alpha 两条线的插件接口兼容'));
    expect(ranked[0]!.memory.name).toBe('rc-alpha-compat');
    expect(ranked[0]!.score).toBeGreaterThan(0);
    expect(ranked[0]!.currentScore).toBeGreaterThan(0);
    expect(ranked[0]!.matchedTerms).toContain('rc');
    expect(ranked[0]!.matchedTerms).toContain('alpha');
  });

  it('keeps the topic when the query is negative instead of dropping it', () => {
    const candidates = [
      memory({ name: 'forbidden-vector-store', title: '禁止使用向量库', body: '禁止使用向量库，统一用关键词检索。' }),
      memory({ name: 'allowed-vector-store', title: '使用向量库', body: '默认使用向量库做召回。' }),
    ];
    const ranked = rankMemories(candidates, query('不使用向量库'));
    const forbidden = find(ranked, 'forbidden-vector-store');
    expect(forbidden.score).toBeGreaterThan(0);
    // the negation word must not delete the topic: Chinese terms still matched
    expect(forbidden.matchedTerms.some((term) => /[\u4e00-\u9fff]/.test(term))).toBe(true);
  });

  it('falls back to recent user messages for a continuation short sentence', () => {
    const ranked = rankMemories(memories, query('继续刚才那个方案', ['记忆索引与按需召回的正文预算怎么算']));
    expect(ranked[0]!.memory.name).toBe('memory-index');
    expect(ranked[0]!.currentScore).toBe(0);
    expect(ranked[0]!.historyScore).toBeGreaterThan(0);
    expect(ranked[0]!.score).toBeGreaterThan(0);
  });

  it('halves the weight of the older recent message', () => {
    const candidates = [
      memory({ name: 'old-topic', title: '旧主题条目说明' }),
      memory({ name: 'new-topic', title: '新主题条目说明' }),
    ];
    const ranked = rankMemories(candidates, query('继续', ['旧主题条目说明内容', '新主题条目说明内容']));
    expect(ranked[0]!.memory.name).toBe('new-topic');
    expect(ranked[0]!.historyScore).toBeGreaterThan(ranked[1]!.historyScore);
  });

  it('scores the path channel from declared paths only, exact file before directory', () => {
    const candidates = [
      memory({ name: 'retrieval-memory', title: '路径主题条目', description: '路径主题说明', paths: ['src/retrieval.ts'] }),
      memory({ name: 'prompts-memory', title: '路径主题条目', description: '路径主题说明', paths: ['src/prompts.ts'] }),
      memory({ name: 'docs-memory', title: '路径主题条目', description: '路径主题说明', paths: ['docs/guide.md'] }),
    ];
    const ranked = rankMemories(candidates, query('路径主题', [], ['src/retrieval.ts']));
    expect(ranked[0]!.memory.name).toBe('retrieval-memory');
    expect(ranked[0]!.pathScore).toBe(1);
    expect(find(ranked, 'prompts-memory').pathScore).toBe(0.5);
    expect(find(ranked, 'docs-memory').pathScore).toBe(0);
  });

  it('breaks ties by current score, path, pinned, then id', () => {
    const twin = (id: string, pinned: boolean) =>
      memory({ id, name: `twin-${id}`, title: '共同主题条目', description: '共同描述文本', body: '共同正文内容', pinned });

    const ranked = rankMemories([twin('mem-z', false), twin('mem-a', false)], query('共同主题'));
    expect(ranked[0]!.score).toBe(ranked[1]!.score);
    expect(ranked[0]!.memory.id).toBe('mem-a');

    const pinned = rankMemories([twin('mem-z', true), twin('mem-a', false)], query('共同主题'));
    expect(pinned[0]!.score).toBe(pinned[1]!.score);
    expect(pinned[0]!.memory.id).toBe('mem-z');
  });

  it('skips disabled memories and returns an empty list for no candidates', () => {
    const disabled = memory({ name: 'disabled-entry', title: '禁用条目', status: 'disabled' });
    expect(rankMemories([disabled], query('禁用条目'))).toEqual([]);
    expect(rankMemories([], query('任意查询'))).toEqual([]);
  });

  it('re-normalises the weights over the channels that carry information', () => {
    const candidates = [
      memory({ name: 'by-path', title: '无关条目', paths: ['src/retrieval.ts'] }),
      memory({ name: 'no-path', title: '无关条目二' }),
    ];
    const ranked = rankMemories(candidates, query('继续', [], ['src/retrieval.ts']));
    const hit = find(ranked, 'by-path');
    expect(hit.pathScore).toBe(1);
    expect(hit.currentScore).toBe(0);
    expect(hit.historyScore).toBe(0);
    expect(hit.score).toBeCloseTo(100, 10);
    expect(find(ranked, 'no-path').score).toBe(0);
  });

  it('discounts an alias hit below an equal tag hit', () => {
    const candidates = [
      memory({ name: 'via-tag', title: '同义命中条目', tags: ['忘记'] }),
      memory({ name: 'via-alias', title: '同义命中条目', aliases: ['忘记'] }),
    ];
    const ranked = rankMemories(candidates, query('忘记'));
    expect(ranked[0]!.memory.name).toBe('via-tag');
    expect(find(ranked, 'via-alias').score).toBeGreaterThan(0);
    expect(find(ranked, 'via-alias').score).toBeLessThan(find(ranked, 'via-tag').score);
  });

  it('keeps English technical identifiers searchable as whole tokens', () => {
    const candidates = [
      memory({ name: 'md-only', title: 'Markdown 唯一存储', description: 'MEMORY.md 是唯一事实源', body: '只使用 Markdown 文件。' }),
      memory({ name: 'sqlite-index', title: 'SQLite 索引', description: '使用 SQLite 保存索引' }),
    ];
    const ranked = rankMemories(candidates, query('MEMORY.md 是不是唯一存储'));
    expect(ranked[0]!.memory.name).toBe('md-only');
    expect(ranked[0]!.matchedTerms).toContain('memory.md');
    expect(find(ranked, 'sqlite-index').score).toBeLessThan(find(ranked, 'md-only').score);
  });
});

describe('renderIndex budget filling', () => {
  it('injects the whole index when everything fits', () => {
    const ranked = rankMemories(
      [
        memory({ name: 'first', title: '第一条记忆', description: '第一条的完整描述。' }),
        memory({ name: 'second', title: '第二条记忆', description: '第二条的完整描述。' }),
        memory({ name: 'third', title: '第三条记忆', description: '第三条的完整描述。' }),
      ],
      query('记忆'),
    );
    const result = renderIndex(ranked, 4096);
    expect(result.shown).toBe(3);
    expect(result.total).toBe(3);
    expect(result.truncated).toBe(false);
    expect(result.remainingBytes).toBeGreaterThan(0);
    expect(result.text).toContain('第一条记忆');
    expect(result.text).toContain('第一条的完整描述。');
    expect(result.text).toContain('[project/first.md](project/first.md)');
    expect(result.text).toContain('[project/third.md](project/third.md)');
    expect(result.selectedIds).toHaveLength(3);
  });

  it('fills the budget with zero-score entries without inventing content', () => {
    const ranked = rankMemories(
      [
        memory({ name: 'grapes', title: '葡萄种植条目', description: '葡萄种植与酿造说明' }),
        memory({ name: 'orchard', title: '果园管理条目', description: '果园的日常管理说明' }),
        memory({ name: 'cellar', title: '酒窖温度条目', description: '酒窖温度与湿度说明' }),
      ],
      query('量子色动力学'),
    );
    expect(ranked.every((entry) => entry.score === 0)).toBe(true);
    expect(renderBodies(ranked, 2048, 5)).toBe('');

    const result = renderIndex(ranked, 1024);
    expect(result.shown).toBe(3);
    expect(result.truncated).toBe(false);
    expect(result.bytes).toBeLessThanOrEqual(1024);
    expect(result.text).toContain('葡萄种植条目');
  });

  it('never exceeds a UTF-8 byte budget and never splits a character or a link', () => {
    const candidates = [
      memory({
        name: 'target',
        title: '定向检索目标条目',
        description: '定向检索目标条目的完整描述，用来验证多字节预算与完整链接不会被截断。',
      }),
      ...Array.from({ length: 20 }, (_, index) =>
        memory({
          name: `filler-${index}`,
          title: `批量占位条目 ${index}`,
          description: `批量占位条目的说明文字 ${index}，用于占用预算。`,
        }),
      ),
    ];
    const ranked = rankMemories(candidates, query('定向检索目标条目'));
    expect(ranked[0]!.memory.name).toBe('target');

    const result = renderIndex(ranked, 512);
    expect(result.bytes).toBe(bytesOf(result.text));
    expect(result.bytes).toBeLessThanOrEqual(512);
    expect(result.remainingBytes).toBe(512 - result.bytes);
    expect(result.text).not.toContain('\uFFFD');
    expect(result.text).toContain('[project/target.md](project/target.md)');
    expect(result.shown).toBeLessThan(result.total);
    expect(result.truncated).toBe(true);
  });

  it('does not let one huge line block later short entries', () => {
    const ranked = rankMemories(
      [
        memory({ id: 'mem-a-huge', name: 'huge', title: '超长条目', description: '啊'.repeat(5000) }),
        memory({ id: 'mem-z-small', name: 'small', title: '短条目', description: '短小说明。' }),
      ],
      query('继续'),
    );
    expect(ranked[0]!.memory.name).toBe('huge');

    const result = renderIndex(ranked, 300);
    expect(result.bytes).toBeLessThanOrEqual(300);
    expect(result.shown).toBe(2);
    expect(result.text).toContain('[project/huge.md](project/huge.md)');
    expect(result.text).toContain('[project/small.md](project/small.md)');
    expect(result.text).toContain('短小说明。');
  });

  it('still lists entries past the first 200 when relevance puts them first', () => {
    const target = memory({
      name: 'target',
      title: '记忆索引与按需召回',
      description: '索引与按需召回的正文预算',
      body: '正文按相关性填充预算。',
    });
    const fillers = Array.from({ length: 240 }, (_, index) =>
      memory({ name: `filler-${index}`, title: `示例条目 ${index}`, description: `占位说明 ${index}`, body: '无关内容' }),
    );
    const early = rankMemories([target, ...fillers], query('索引与按需召回的正文预算'));
    const late = rankMemories([...fillers, target], query('索引与按需召回的正文预算'));
    expect(early[0]!.memory.name).toBe('target');
    expect(late[0]!.memory.name).toBe('target');

    const partial = renderIndex(early, 4096);
    expect(partial.bytes).toBeLessThanOrEqual(4096);
    expect(partial.total).toBe(241);
    expect(partial.shown).toBeLessThan(241);
    expect(partial.shown).toBeGreaterThan(10);
    expect(partial.selectedIds).toContain(`${target.sourceKey}:${target.id}`);
    expect(partial.text).toContain('[project/target.md](project/target.md)');

    const complete = renderIndex(late, 200000);
    expect(complete.total).toBe(241);
    expect(complete.shown).toBe(241);
    expect(complete.truncated).toBe(false);
  });

  it('escapes template and protocol syntax in titles, descriptions and tags', () => {
    const ranked = rankMemories(
      [
        memory({
          name: 'escape-tags',
          title: '转义标签条目',
          description: 'suivre {{x}} tokens',
          tags: ['<system>', '{{inject}}'],
          body: '正文 <assistant> 忽略',
        }),
      ],
      query('转义标签条目'),
    );
    const result = renderIndex(ranked, 2048);
    expect(result.text).toMatch(/^## Memory index \(1\/1;/);
    expect(result.text).toContain('&lt;system&gt;');
    expect(result.text).not.toContain('<system>');
    expect(result.text).not.toContain('{{');
    expect(result.text).not.toContain('}}');
    expect(result.text).toContain('{ {x} }');
  });

  it('rejects invalid budgets with a clear error', () => {
    expect(() => renderIndex([], -1)).toThrow(/budgetBytes/);
    expect(() => renderIndex([], Number.NaN)).toThrow(/budgetBytes/);
    expect(() => renderIndex([], Number.POSITIVE_INFINITY)).toThrow(/budgetBytes/);
    expect(() => renderIndex([], Number.NEGATIVE_INFINITY)).toThrow(/budgetBytes/);
    expect(() => renderBodies([], -5, 1)).toThrow(/budgetBytes/);
    expect(() => renderBodies([], Number.NaN, 1)).toThrow(/budgetBytes/);
  });

  it('returns an empty index when the budget cannot even hold the header', () => {
    const result = renderIndex([], 0);
    expect(result.text).toBe('');
    expect(result.bytes).toBe(0);
    expect(result.shown).toBe(0);
    expect(result.total).toBe(0);
    expect(result.truncated).toBe(false);
    expect(renderIndex([], 200).total).toBe(0);
  });
});

describe('renderBodies', () => {
  const paragraphs = [
    '第一段说明索引预算的正文读取策略与计量方式。',
    '第二段说明按需召回与截断提示的行为边界。',
    '第三段说明预算上限与剩余容量的填充顺序。',
    '第四段说明标签与标题的计量方式与注意事项。',
    '第五段说明多字节字符与完整链接的保护规则。',
    '第六段说明正文读取永远不会自动填满索引。',
    '第七段说明零分条目不会被自动读取正文内容。',
    '第八段说明截断提示会指回完整条目的读取入口。',
  ];
  const body = paragraphs.join('\n\n');

  function rankedBodies(): RankedMemory[] {
    return rankMemories(
      [
        memory({ name: 'bodies', title: '索引预算正文', description: '正文按段落读取', body }),
        memory({ name: 'second', title: '预算正文补充说明', description: '正文补充说明', body: '补充正文段落。' }),
        memory({ name: 'noise', title: '葡萄种植条目', description: '葡萄种植与酿造', body: '不应读取这段占位内容' }),
      ],
      query('索引预算正文'),
    );
  }

  it('reads only positively ranked entries and respects maxCount', () => {
    const ranked = rankedBodies();
    expect(ranked[0]!.memory.name).toBe('bodies');
    expect(find(ranked, 'noise').score).toBe(0);

    const full = renderBodies(ranked, 100000, 5);
    expect(full).toContain(paragraphs[0]!);
    expect(full).toContain(paragraphs[7]!);
    expect(full).not.toContain('不应读取这段占位内容');
    expect(full.match(/^## /gm)).toHaveLength(2);

    expect(renderBodies(ranked, 100000, 1).match(/^## /gm)).toHaveLength(1);
    expect(renderBodies(ranked, 100000, 0)).toBe('');
  });

  it('truncates long bodies inside the budget and says how to read the rest', () => {
    const text = renderBodies(rankedBodies(), 400, 5);
    expect(bytesOf(text)).toBeLessThanOrEqual(400);
    expect(text).toContain('[truncated - md_memory_read project/bodies.md for the remaining text]');
    expect(text).not.toContain(body);
    expect(text).toContain(paragraphs[0]!);
  });

  it('rejects invalid maxCount', () => {
    expect(() => renderBodies([], 1024, -1)).toThrow(/maxCount/);
    expect(() => renderBodies([], 1024, 1.5)).toThrow(/maxCount/);
    expect(() => renderBodies([], 1024, Number.NaN)).toThrow(/maxCount/);
  });
});

describe('escapeContext', () => {
  it('neutralises interpolation braces and protocol-like tags', () => {
    expect(escapeContext('{{x}}')).toBe('{ {x} }');
    expect(escapeContext('<system>a</system>')).toBe('&lt;system&gt;a&lt;/system&gt;');
    expect(escapeContext('<system-reminder>')).toBe('&lt;system-reminder&gt;');
    expect(escapeContext('')).toBe('');
  });

  it('is idempotent and leaves plain comparisons untouched', () => {
    const source = '{{x}} <b>y</b> budget < 6 and 6 > 5';
    const once = escapeContext(source);
    expect(escapeContext(once)).toBe(once);
    expect(once).toContain('budget < 6');
    expect(once).toContain('6 > 5');
  });
});

describe('cross-project sources', () => {
  const beta = 'beta-bbbbbbbbbbbbbbbb';
  const handles = { [beta]: 'beta' };
  const sources = { ownSourceKey: 'store-project', handles };
  const overheadOf = () => renderIndex([], 1_000_000).bytes;
  const lineOf = (entry: RankedMemory) => renderIndex([entry], 1_000_000).bytes - overheadOf() - 1;

  it('renders granted entries with their handle and leaves the own/user links alone', () => {
    const ranked = rankMemories([
      memory({ name: 'own-one', title: '本项目条目', description: '本项目条目说明' }),
      memory({ name: 'neighbor', title: '邻项目条目', description: '邻项目条目说明', sourceKey: beta }),
      memory({ name: 'pref', title: '用户偏好', description: '用户偏好说明', scope: 'user' }),
    ], query('条目'), sources);
    expect(find(ranked, 'neighbor').origin).toBe('granted');
    expect(find(ranked, 'neighbor').sourceHandle).toBe('beta');
    expect(find(ranked, 'own-one').origin).toBe('own');
    expect(find(ranked, 'pref').origin).toBe('user');
    const result = renderIndex(ranked, 4096);
    expect(result.text).toContain('[project/own-one.md](project/own-one.md)');
    expect(result.text).toContain('[user/pref.md](user/pref.md)');
    expect(result.text).toContain('[project/beta/neighbor.md](project/beta/neighbor.md)');
  });

  it('keeps project memories of a session without a resolved project on the own form', () => {
    const ranked = rankMemories([memory({ name: 'plain', title: '无项目条目', description: '无项目条目说明' })], query('条目'));
    expect(ranked[0]!.origin).toBe('own');
    expect(renderIndex(ranked, 4096).text).toContain('[project/plain.md](project/plain.md)');
  });

  it('refuses a granted line that exceeds half the budget even when bytes remain', () => {
    const budget = 700;
    const own = memory({ name: 'own', title: '本项目条目', description: '本项目条目说明' });
    const neighbor = memory({ name: 'neighbor', title: '邻项目条目', description: '看'.repeat(120), sourceKey: beta });
    const ranked = rankMemories([own, neighbor], query('条目'), sources);
    const grantedLine = lineOf(find(ranked, 'neighbor'));
    expect(grantedLine).toBeGreaterThan(Math.floor(budget * CROSS_PROJECT_SHARE));
    expect(grantedLine).toBeLessThan(budget - overheadOf());
    const result = renderIndex(ranked, budget);
    expect(result.bytes).toBeLessThanOrEqual(budget);
    expect(result.text).toContain('[project/own.md](project/own.md)');
    // The entry survives only in its smallest form; its own description never lands.
    expect(result.text).not.toContain('看');
    expect(result.text).toContain('[project/beta/neighbor.md](project/beta/neighbor.md)');
  });

  it('shares one granted cap across projects and still fills the rest with own entries', () => {
    const budget = 900;
    const cap = Math.floor(budget * CROSS_PROJECT_SHARE);
    const gamma = 'gamma-cccccccccccccccc';
    const ranked = rankMemories([
      memory({ name: 'own', title: '本项目条目', description: '本项目条目说明' }),
      memory({ name: 'a-rule', title: '邻项目条目', description: '甲'.repeat(60), sourceKey: beta }),
      memory({ name: 'b-rule', title: '邻项目条目', description: '乙'.repeat(60), sourceKey: gamma }),
    ], query('条目'), { ownSourceKey: 'store-project', handles: { [beta]: 'beta', [gamma]: 'gamma' } });
    const each = lineOf(find(ranked, 'a-rule'));
    expect(each).toBeLessThan(cap);
    expect(each * 2).toBeGreaterThan(cap);
    expect(lineOf(find(ranked, 'own')) + each * 2).toBeLessThan(budget - overheadOf());
    const result = renderIndex(ranked, budget);
    expect(result.text).toContain('[project/own.md](project/own.md)');
    expect(result.text).toContain(`[project/beta/a-rule.md](project/beta/a-rule.md) - ${'甲'.repeat(60)}`);
    const grantedBytes = result.text.split('\n')
      .filter(line => line.includes('[project/beta/') || line.includes('[project/gamma/'))
      .reduce((total, line) => total + Buffer.byteLength(line, 'utf8') + 1, 0);
    expect(grantedBytes).toBeLessThanOrEqual(cap);
    // The second granted entry cannot take its description: the shared cap is spent.
    expect(result.text).not.toContain('乙'.repeat(60));
  });

  it('points a truncated granted body at its project handle', () => {
    const ranked = rankMemories([memory({ name: 'neighbor', title: '邻项目条目', description: '邻项目条目说明', body: '段落一。\n\n' + '看'.repeat(400), sourceKey: beta })], query('邻项目条目'), sources);
    const text = renderBodies(ranked, 600, 5);
    expect(Buffer.byteLength(text, 'utf8')).toBeLessThanOrEqual(600);
    expect(text).toContain('md_memory_read scope="project" project="beta" name="neighbor"');
  });

  it('breaks identical ids from different projects apart by source', () => {
    const twin = (sourceKey: string, name: string) => memory({ id: 'project:same', name, title: '同名条目', description: '同名条目说明', sourceKey });
    const ranked = rankMemories([twin('store-project', 'same-own'), twin(beta, 'same-beta')], query('同名条目'), sources);
    expect(ranked[0]!.sourceKey).toBe(beta);
    expect(ranked[1]!.sourceKey).toBe('store-project');
  });

  it('counts the source key in the selected ids', () => {
    const ranked = rankMemories([memory({ name: 'own', title: '本项目条目', description: '本项目条目说明' })], query('条目'), sources);
    expect(renderIndex(ranked, 4096).selectedIds[0]).toBe(`${find(ranked, 'own').sourceKey}:${find(ranked, 'own').memory.id}`);
  });
});
