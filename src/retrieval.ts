import { MemoryError } from './types.js';
import type { IndexResult, Memory, MemoryOrigin, RankedMemory, RetrievalQuery } from './types.js';

/**
 * Deterministic retrieval and context rendering for the Markdown memory plugin.
 *
 * Implements the scoring and filling rules of DESIGN.md section 6: three query
 * channels (current message .70, last two real user messages .20, touched paths
 * .10) with re-normalisation over the channels that actually carry information,
 * field-weighted BM25F-style term scoring with saturation and coverage, IDF over
 * the candidate snapshot, CJK segmentation with low-weight bigrams for
 * unrecognised long words, stopword filtering, alias discounts, and a byte
 * budget that is filled in relevance order.
 *
 * Entries granted from other projects are ranked by the same score but capped by
 * CROSS_PROJECT_SHARE of the total budget, so a chatty neighbour project can
 * never crowd out the current project's own context.
 */

/** Share of the index/body budget that granted projects may occupy together. */
export const CROSS_PROJECT_SHARE = 0.5;

/** Which memory block the session reads from, and the handles used in links. */
export interface SourceContext {
  ownSourceKey?: string;
  handles?: Record<string, string>;
}

/* ------------------------------------------------------------------ */
/* byte helpers                                                        */
/* ------------------------------------------------------------------ */

const encoder = new TextEncoder();

function utf8Bytes(text: string): number {
  return encoder.encode(text).length;
}

function byteSafePrefix(text: string, maxBytes: number): string {
  if (maxBytes <= 0) return '';
  let bytes = 0;
  let out = '';
  for (const char of text) {
    const size = utf8Bytes(char);
    if (bytes + size > maxBytes) break;
    bytes += size;
    out += char;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* context escaping                                                    */
/* ------------------------------------------------------------------ */

const TAG_PATTERN = /<(\/?)([A-Za-z][A-Za-z0-9_:.-]*)([^<>]*)>/g;

/**
 * Neutralise template interpolation and protocol-like tags before any memory
 * text is injected into the host context. Idempotent: running it twice changes
 * nothing further.
 */
export function escapeContext(text: string): string {
  if (typeof text !== 'string' || text === '') return '';
  return text
    .replace(/\{\{/g, '{ {')
    .replace(/\}\}/g, '} }')
    .replace(TAG_PATTERN, (_match: string, slash: string, name: string, rest: string): string => `&lt;${slash}${name}${rest}&gt;`);
}

function flattenOneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------------------------ */
/* tokenisation                                                        */
/* ------------------------------------------------------------------ */

const CHANNEL_WEIGHT = { current: 0.7, recent: 0.2, paths: 0.1 } as const;
const RECENT_SECOND_WEIGHT = 0.5;

type FieldName = 'title' | 'description' | 'tags' | 'body';
const FIELD_ORDER: readonly FieldName[] = ['title', 'description', 'tags', 'body'];
const FIELD_WEIGHTS: Record<FieldName, number> = { title: 3, description: 2, tags: 3, body: 0.5 };

const LENGTH_NORM = 0.25;
const SATURATION = 1.2;
const BODY_BLEND = 0.8;
const COVERAGE_BLEND = 0.2;
const MAX_TF = 3;
const BIGRAM_WEIGHT = 0.45;
const ALIAS_WEIGHT = 0.6;
const MAX_MATCHED_TERMS = 32;

const CJK_PATTERN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const IDENTIFIER_PATTERN = /[a-z0-9][a-z0-9_.+#@/-]*/g;
const IDENTIFIER_MIN_LENGTH = 3;

const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });

/** Chinese function words and continuation fillers, longest phrases first. */
const CN_STOPWORDS: readonly string[] = [
  '什么时候', '为什么', '继续', '接着', '然后', '刚才', '刚刚', '已经', '现在', '怎么', '怎样', '如何', '什么',
  '这个', '那个', '这些', '那些', '这里', '那里', '上面', '下面', '前面', '后面', '之前', '以后', '一下', '一点',
  '一些', '我们', '你们', '他们', '咱们', '请问', '帮我', '帮忙', '好的', '好吧', '谢谢', '多谢', '收到', '明白',
  '但是', '不过', '因为', '所以', '如果', '那么', '而且', '以及', '还有', '就是', '还是', '或者', '也是',
  '可以', '能够', '应该', '可能', '大概', '需要', '时候', '事情', '东西', '问题', '方案', '请',
  '的', '了', '是', '在', '我', '你', '他', '她', '它', '这', '那', '把', '被', '让', '给', '对', '从', '到',
  '和', '与', '及', '或', '而', '则', '就', '也', '还', '都', '又', '再', '很', '太', '更', '最',
  '吗', '呢', '吧', '啊', '呀', '哦', '嗯', '呗', '嘛',
];
// Negation words (不 / 没有 / not / never) stay searchable on purpose: a query such
// as "do not use a vector store" must still match the memory that forbids it.

const CN_STOPWORD_SET = new Set(CN_STOPWORDS);
const CN_STOPWORDS_BY_LENGTH = [...CN_STOPWORDS].sort((a, b) => b.length - a.length);

const EN_STOPWORDS = new Set<string>([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'than', 'of', 'to', 'in', 'on', 'at', 'for', 'with',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did', 'have', 'has', 'had',
  'i', 'you', 'we', 'they', 'it', 'this', 'that', 'these', 'those', 'my', 'your', 'our', 'their', 'me', 'us', 'them',
  'what', 'which', 'how', 'why', 'when', 'where', 'who', 'can', 'could', 'should', 'would', 'will', 'shall',
  'may', 'might', 'must', 'yes', 'ok', 'okay', 'please', 'thanks', 'thank', 'just', 'about', 'from', 'as', 'by',
  'so', 'also', 'more', 'most', 'very', 'too', 'there', 'here', 'again', 'still', 'already', 'now', 'into',
  'over', 'under', 'up', 'down', 'out', 'off', 'only', 'such', 'same', 'other', 'some', 'any', 'all', 'both',
  'each', 'few', 'many', 'much', 'own', 's', 't', 'd', 'll', 're', 've', 'm',
]);

interface WeightedToken {
  text: string;
  weight: number;
  /** Query-side group: the segmented word a bigram came from. */
  group: string;
}

function normalizeText(text: string): string {
  return text.normalize('NFKC').toLowerCase();
}

function trimTokenEdges(token: string): string {
  return token.replace(/^[._+#@/-]+/, '').replace(/[._+#@/-]+$/, '');
}

function isCjk(token: string): boolean {
  return CJK_PATTERN.test(token);
}

function bigramsOf(token: string): string[] {
  const chars = [...token];
  const out: string[] = [];
  for (let i = 0; i + 1 < chars.length; i += 1) out.push(`${chars[i]!}${chars[i + 1]!}`);
  return out;
}

/**
 * Word segmentation with Intl.Segmenter, plus whole technical identifiers such
 * as "dsh-md-memory" or "MEMORY.md" which the word breaker would split apart.
 * Chinese words of three or more characters also emit low-weight bigrams so an
 * unrecognised compound still matches partially.
 */
function tokenize(text: string): WeightedToken[] {
  const normalized = normalizeText(text);
  const raw: string[] = [];
  for (const segment of segmenter.segment(normalized)) {
    if (segment.isWordLike) raw.push(segment.segment);
  }
  for (const match of normalized.match(IDENTIFIER_PATTERN) ?? []) {
    if (match.length >= IDENTIFIER_MIN_LENGTH && /[._+#@/-]/.test(match)) raw.push(match);
  }
  const out: WeightedToken[] = [];
  for (const candidate of raw) {
    const token = trimTokenEdges(candidate);
    if (token === '') continue;
    if (isCjk(token) && [...token].length >= 3) {
      out.push({ text: token, weight: 1, group: token });
      for (const gram of bigramsOf(token)) out.push({ text: gram, weight: BIGRAM_WEIGHT, group: token });
    } else {
      out.push({ text: token, weight: 1, group: token });
    }
  }
  return out;
}

function isStopword(token: string): boolean {
  return CN_STOPWORD_SET.has(token) || EN_STOPWORDS.has(token);
}

/** True when the text still carries topic content after removing filler words. */
function hasTopicContent(normalized: string): boolean {
  let stripped = normalized;
  for (const stopword of CN_STOPWORDS_BY_LENGTH) {
    if (stripped.includes(stopword)) stripped = stripped.split(stopword).join(' ');
  }
  for (const word of stripped.match(/[a-z0-9][a-z0-9_.-]*/g) ?? []) {
    if (!EN_STOPWORDS.has(word)) return true;
  }
  return CJK_PATTERN.test(stripped);
}

interface QueryVariant {
  text: string;
  weight: number;
}

interface QueryGroup {
  key: string;
  variants: QueryVariant[];
}

function buildQueryGroups(tokens: readonly WeightedToken[]): QueryGroup[] {
  const byGroup = new Map<string, QueryGroup>();
  for (const token of tokens) {
    if (isStopword(token.text)) continue;
    if (!isCjk(token.text) && token.text.length < 2) continue;
    let group = byGroup.get(token.group);
    if (group === undefined) {
      group = { key: token.group, variants: [] };
      byGroup.set(token.group, group);
    }
    if (!group.variants.some((variant) => variant.text === token.text)) {
      group.variants.push({ text: token.text, weight: token.weight });
    }
  }
  return [...byGroup.values()];
}

interface TextAnalysis {
  groups: QueryGroup[];
  hasTopic: boolean;
}

function analyzeQueryText(text: string): TextAnalysis {
  return { groups: buildQueryGroups(tokenize(text)), hasTopic: hasTopicContent(normalizeText(text)) };
}

/* ------------------------------------------------------------------ */
/* document statistics                                                 */
/* ------------------------------------------------------------------ */

interface DocStats {
  memory: Memory;
  counts: Record<FieldName, Map<string, number>>;
  lengths: Record<FieldName, number>;
  terms: Set<string>;
}

interface ScoreContext {
  docs: DocStats[];
  norms: Record<FieldName, number>[];
}

function toFieldMap(tokens: readonly WeightedToken[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const token of tokens) {
    map.set(token.text, Math.min(MAX_TF, (map.get(token.text) ?? 0) + token.weight));
  }
  return map;
}

function tagAndAliasTokens(memory: Memory): WeightedToken[] {
  const out: WeightedToken[] = [];
  for (const tag of memory.tags ?? []) {
    if (typeof tag !== 'string') continue;
    out.push(...tokenize(tag));
  }
  for (const alias of memory.aliases ?? []) {
    if (typeof alias !== 'string') continue;
    const seen = new Set<string>();
    for (const token of tokenize(alias)) {
      if (seen.has(token.text)) continue;
      seen.add(token.text);
      out.push({ text: token.text, weight: token.weight * ALIAS_WEIGHT, group: token.group });
    }
  }
  return out;
}

function buildDoc(memory: Memory): DocStats {
  const title = tokenize(memory.title ?? '');
  const description = tokenize(memory.description ?? '');
  const tags = tagAndAliasTokens(memory);
  const body = tokenize(memory.body ?? '');
  const counts: Record<FieldName, Map<string, number>> = {
    title: toFieldMap(title),
    description: toFieldMap(description),
    tags: toFieldMap(tags),
    body: toFieldMap(body),
  };
  const lengths: Record<FieldName, number> = {
    title: title.length,
    description: description.length,
    tags: tags.length,
    body: body.length,
  };
  const terms = new Set<string>();
  for (const field of FIELD_ORDER) for (const term of counts[field].keys()) terms.add(term);
  return { memory, counts, lengths, terms };
}

function computeNorms(docs: readonly DocStats[]): Record<FieldName, number>[] {
  const average = { title: 0, description: 0, tags: 0, body: 0 } as Record<FieldName, number>;
  for (const field of FIELD_ORDER) {
    let total = 0;
    for (const doc of docs) total += doc.lengths[field];
    average[field] = docs.length > 0 ? total / docs.length : 0;
  }
  return docs.map((doc) => {
    const norms = { title: 1, description: 1, tags: 1, body: 1 } as Record<FieldName, number>;
    for (const field of FIELD_ORDER) {
      const length = doc.lengths[field];
      norms[field] = length > 0 && average[field] > 0 ? LENGTH_NORM + (1 - LENGTH_NORM) * (length / average[field]) : 1;
    }
    return norms;
  });
}

/**
 * idf(t) = ln(1 + (N - df(t) + 0.5) / (df(t) + 0.5)) over the candidate snapshot.
 * Cached per term because every query variant is looked up for every document.
 */
function makeIdf(docs: readonly DocStats[]): (term: string) => number {
  const cache = new Map<string, number>();
  const total = docs.length;
  return (term: string): number => {
    const cached = cache.get(term);
    if (cached !== undefined) return cached;
    let documentFrequency = 0;
    for (const doc of docs) if (doc.terms.has(term)) documentFrequency += 1;
    const value = Math.log(1 + (total - documentFrequency + 0.5) / (documentFrequency + 0.5));
    cache.set(term, value);
    return value;
  };
}

function saturation(doc: DocStats, norms: Record<FieldName, number>, term: string): number {
  let weighted = 0;
  for (const field of FIELD_ORDER) {
    const count = doc.counts[field].get(term);
    if (count === undefined) continue;
    weighted += FIELD_WEIGHTS[field] * (count / norms[field]!);
  }
  return weighted > 0 ? weighted / (weighted + SATURATION) : 0;
}

interface TextScore {
  l: number;
  matched: string[];
}

/** B (field-weighted, IDF-weighted, saturated) and K (coverage) for one text. */
function scoreText(context: ScoreContext, idf: (term: string) => number, index: number, groups: readonly QueryGroup[]): TextScore {
  if (groups.length === 0) return { l: 0, matched: [] };
  const doc = context.docs[index]!;
  const norms = context.norms[index]!;
  let numerator = 0;
  let denominator = 0;
  let coverage = 0;
  const matched: string[] = [];
  for (const group of groups) {
    let best = 0;
    let bestPossible = 0;
    let hitWeight = 0;
    for (const variant of group.variants) {
      const possible = idf(variant.text) * variant.weight;
      if (possible > bestPossible) bestPossible = possible;
      const saturated = saturation(doc, norms, variant.text);
      if (saturated > 0 && variant.weight > hitWeight) hitWeight = variant.weight;
      const contribution = possible * saturated;
      if (contribution > best) best = contribution;
    }
    numerator += best;
    denominator += bestPossible;
    if (hitWeight > 0) {
      coverage += hitWeight;
      matched.push(group.key);
    }
  }
  const b = denominator > 0 ? numerator / denominator : 0;
  const k = coverage / groups.length;
  return { l: Math.min(1, BODY_BLEND * b + COVERAGE_BLEND * k), matched };
}

/* ------------------------------------------------------------------ */
/* path channel                                                        */
/* ------------------------------------------------------------------ */

function normalizePath(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/\/+$/, '').toLowerCase();
}

function directoryOf(path: string): string {
  const index = path.lastIndexOf('/');
  return index < 0 ? '' : path.slice(0, index);
}

function baseNameOf(path: string): string {
  const index = path.lastIndexOf('/');
  return index < 0 ? path : path.slice(index + 1);
}

function extensionOf(name: string): string {
  const index = name.lastIndexOf('.');
  return index <= 0 ? '' : name.slice(index).toLowerCase();
}

function relatePaths(memoryPath: string, touchedPath: string): number {
  if (memoryPath === touchedPath) return 1;
  const memoryDirectory = directoryOf(memoryPath);
  if (memoryDirectory !== '' && memoryDirectory === directoryOf(touchedPath)) return 0.5;
  if (memoryPath.startsWith(`${touchedPath}/`) || touchedPath.startsWith(`${memoryPath}/`)) return 0.5;
  const memoryBase = baseNameOf(memoryPath).replace(/\.[^.]+$/, '');
  const touchedBase = baseNameOf(touchedPath).replace(/\.[^.]+$/, '');
  if (memoryBase !== '' && memoryBase === touchedBase) return 0.5;
  const memoryExtension = extensionOf(baseNameOf(memoryPath));
  if (memoryExtension !== '' && memoryExtension === extensionOf(baseNameOf(touchedPath))) return 0.1;
  return 0;
}

function pathScore(memoryPaths: readonly string[] | undefined, touchedPaths: readonly string[]): number {
  let best = 0;
  for (const declared of memoryPaths ?? []) {
    if (typeof declared !== 'string') continue;
    const memoryPath = normalizePath(declared);
    if (memoryPath === '') continue;
    for (const touched of touchedPaths) {
      const touchedPath = normalizePath(touched);
      if (touchedPath === '') continue;
      const score = relatePaths(memoryPath, touchedPath);
      if (score === 1) return 1;
      if (score > best) best = score;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* ranking                                                             */
/* ------------------------------------------------------------------ */

function compareRanked(a: RankedMemory, b: RankedMemory): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.currentScore !== a.currentScore) return b.currentScore - a.currentScore;
  if (b.pathScore !== a.pathScore) return b.pathScore - a.pathScore;
  if (a.memory.pinned !== b.memory.pinned) return a.memory.pinned ? -1 : 1;
  if (a.memory.scope !== b.memory.scope) return a.memory.scope < b.memory.scope ? -1 : 1;
  // Memory ids are `${scope}:${name}` and repeat across projects, so the source
  // must break the tie before the id does.
  if (a.sourceKey !== b.sourceKey) return a.sourceKey < b.sourceKey ? -1 : 1;
  if (a.memory.id !== b.memory.id) return a.memory.id < b.memory.id ? -1 : 1;
  return 0;
}

function sourceOf(memory: Memory, context: SourceContext): { sourceKey: string; origin: MemoryOrigin; sourceHandle?: string } {
  const sourceKey = memory.sourceKey || (memory.scope === 'user' ? 'user' : context.ownSourceKey ?? 'project');
  if (sourceKey === 'user') return { sourceKey, origin: 'user' };
  if (context.ownSourceKey === undefined || sourceKey === context.ownSourceKey) return { sourceKey, origin: 'own' };
  const sourceHandle = context.handles?.[sourceKey];
  return { sourceKey, origin: 'granted', ...(sourceHandle ? { sourceHandle } : {}) };
}

/** Link printed in the index and used by md_memory_read: 2 segments = own, 3 = granted. */
function linkOf(entry: RankedMemory): string {
  if (entry.memory.scope === 'user') return `user/${entry.memory.name}.md`;
  return entry.origin === 'granted' && entry.sourceHandle ? `project/${entry.sourceHandle}/${entry.memory.name}.md` : `project/${entry.memory.name}.md`;
}

export function rankMemories(memories: Memory[], query: RetrievalQuery, sources: SourceContext = {}): RankedMemory[] {
  const eligible = memories.filter((memory) => memory.status !== 'disabled');
  if (eligible.length === 0) return [];

  const docs = eligible.map(buildDoc);
  const context: ScoreContext = { docs, norms: computeNorms(docs) };
  const idf = makeIdf(docs);

  const currentAnalysis = analyzeQueryText(query.current);
  const recentAnalyses = query.recent.slice(-2).map(analyzeQueryText);
  const touchedPaths = query.touchedPaths;

  const currentUsed = currentAnalysis.hasTopic && currentAnalysis.groups.length > 0;
  const recentUsable = recentAnalyses.filter((analysis) => analysis.hasTopic && analysis.groups.length > 0);
  const recentUsed = recentUsable.length > 0;
  const pathsUsed = touchedPaths.length > 0;
  const weightSum =
    (currentUsed ? CHANNEL_WEIGHT.current : 0) + (recentUsed ? CHANNEL_WEIGHT.recent : 0) + (pathsUsed ? CHANNEL_WEIGHT.paths : 0);

  const ranked: RankedMemory[] = [];
  for (let index = 0; index < docs.length; index += 1) {
    const memory = docs[index]!.memory;
    const current = currentUsed ? scoreText(context, idf, index, currentAnalysis.groups) : { l: 0, matched: [] as string[] };
    const matched = [...current.matched];

    let history = 0;
    if (recentUsed) {
      let weighted = 0;
      let weightTotal = 0;
      for (let position = 0; position < recentAnalyses.length; position += 1) {
        const analysis = recentAnalyses[position]!;
        if (!analysis.hasTopic || analysis.groups.length === 0) continue;
        const weight = position === recentAnalyses.length - 1 ? 1 : RECENT_SECOND_WEIGHT;
        const score = scoreText(context, idf, index, analysis.groups);
        weighted += weight * score.l;
        weightTotal += weight;
        for (const term of score.matched) if (!matched.includes(term)) matched.push(term);
      }
      history = weightTotal > 0 ? weighted / weightTotal : 0;
    }

    const path = pathsUsed ? pathScore(memory.paths, touchedPaths) : 0;
    const score =
      weightSum > 0
        ? (100 *
            (CHANNEL_WEIGHT.current * (currentUsed ? current.l : 0) + CHANNEL_WEIGHT.recent * history + CHANNEL_WEIGHT.paths * path)) /
          weightSum
        : 0;

    ranked.push({
      memory,
      ...sourceOf(memory, sources),
      score,
      currentScore: currentUsed ? 100 * current.l : 0,
      historyScore: recentUsed ? 100 * history : 0,
      pathScore: path,
      matchedTerms: matched.slice(0, MAX_MATCHED_TERMS),
    });
  }

  ranked.sort(compareRanked);
  return ranked;
}

/* ------------------------------------------------------------------ */
/* index rendering                                                     */
/* ------------------------------------------------------------------ */

const SENTENCE_TERMINATORS = new Set<string>(['。', '！', '？', '；', '…', '!', '?', ';', '\n']);
const INDEX_FOOTER = '用 md_memory_read(scope, name) 读完整条目；md_memory_search 覆盖整个库。同主题扩展原条目，不要新建重复。';

function isSentenceEnd(chars: readonly string[], index: number): boolean {
  const char = chars[index];
  if (char === undefined) return false;
  if (SENTENCE_TERMINATORS.has(char)) return true;
  if (char === '.') {
    const next = index + 1 < chars.length ? chars[index + 1]! : '';
    return next === '' || /\s/.test(next);
  }
  return false;
}

/** Sentence-boundary prefixes of a description, never partial. Single pass. */
function sentencePrefixes(text: string): string[] {
  const chars = [...text];
  const out: string[] = [];
  for (let index = 0; index + 1 < chars.length; index += 1) {
    if (!isSentenceEnd(chars, index)) continue;
    const prefix = chars.slice(0, index + 1).join('').trimEnd();
    if (prefix !== '') out.push(prefix);
  }
  return out;
}

interface DescCandidate {
  text: string;
  bytes: number;
}

interface IndexPlan {
  entry: RankedMemory;
  memory: Memory;
  title: string;
  link: string;
  tags: string;
  candidates: DescCandidate[];
  selected: boolean;
  candidateIndex: number;
  line: string;
}

function descriptionCandidates(description: string): DescCandidate[] {
  const full = escapeContext(flattenOneLine(description));
  const candidates: DescCandidate[] = [];
  if (full !== '') {
    candidates.push({ text: full, bytes: utf8Bytes(full) });
    const prefixes = sentencePrefixes(full);
    for (let index = prefixes.length - 1; index >= 0; index -= 1) {
      const text = prefixes[index]!;
      if (text === '' || text === full) continue;
      const bytes = utf8Bytes(text);
      if (candidates.some((candidate) => candidate.bytes === bytes)) continue;
      candidates.push({ text, bytes });
    }
  }
  candidates.push({ text: '', bytes: 0 });
  return candidates;
}

function renderTags(memory: Memory): string {
  const tags = (memory.tags ?? []).filter((tag) => typeof tag === 'string' && tag.trim() !== '');
  return tags
    .slice(0, 3)
    .map((tag) => ` #${escapeContext(flattenOneLine(tag))}`)
    .join('');
}

function buildPlan(ranked: RankedMemory): IndexPlan {
  const memory = ranked.memory;
  const link = linkOf(ranked);
  const title = flattenOneLine(memory.title ?? '') || memory.name;
  return {
    entry: ranked,
    memory,
    title: escapeContext(title),
    link,
    tags: renderTags(memory),
    candidates: descriptionCandidates(memory.description ?? ''),
    selected: false,
    candidateIndex: 0,
    line: '',
  };
}

function renderLine(plan: IndexPlan, description: string): string {
  const tail = description === '' ? '' : ` - ${description}`;
  return `- **${plan.title}** [${plan.link}](${plan.link})${plan.tags}${tail}`;
}

function bestFit(plan: IndexPlan, remaining: number): { index: number; line: string } | undefined {
  for (let index = 0; index < plan.candidates.length; index += 1) {
    const line = renderLine(plan, plan.candidates[index]!.text);
    if (utf8Bytes(line) + 1 <= remaining) return { index, line };
  }
  return undefined;
}

function indexHeader(shown: number, total: number, partial: boolean): string {
  // Stable byte length avoids iterative packing or digit-boundary oscillation.
  const count = String(shown).padStart(String(total).length);
  return `## Memory index (${count}/${total}; ${partial ? 'partial ' : 'complete'})`;
}

interface FillResult {
  text: string;
  bytes: number;
  shown: number;
  anyShortened: boolean;
  selectedIds: string[];
}

/**
 * One filling pass: strict relevance order with the largest description that
 * fits. An entry whose smallest form does not fit is skipped so that later,
 * shorter entries still fill the budget.
 *
 * Granted projects share a hard cap of CROSS_PROJECT_SHARE of the total budget:
 * a granted entry only sees the room left under that cap, so the current
 * project and the user scope still fill whatever the neighbour leaves.
 */
function fillIndex(plans: IndexPlan[], budget: number, header: string, footer: string): FillResult {
  const overhead = utf8Bytes(header) + 1 + utf8Bytes(footer) + 1;
  let remaining = budget - overhead;
  const grantedBudget = Math.floor(budget * CROSS_PROJECT_SHARE);
  let grantedUsed = 0;

  for (const plan of plans) {
    plan.selected = false;
    plan.candidateIndex = 0;
    plan.line = '';
  }

  for (const plan of plans) {
    const room = plan.entry.origin === 'granted' ? Math.min(remaining, grantedBudget - grantedUsed) : remaining;
    const pick = room <= 0 ? undefined : bestFit(plan, room);
    if (pick === undefined) continue;
    plan.selected = true;
    plan.candidateIndex = pick.index;
    plan.line = pick.line;
    const size = utf8Bytes(pick.line) + 1;
    remaining -= size;
    if (plan.entry.origin === 'granted') grantedUsed += size;
  }

  const lines = plans.filter((plan) => plan.selected).map((plan) => plan.line);
  const text = lines.length > 0 ? `${header}\n${lines.join('\n')}\n${footer}` : `${header}\n${footer}`;
  return {
    text,
    bytes: utf8Bytes(text),
    shown: lines.length,
    anyShortened: plans.some((plan) => plan.selected && plan.candidateIndex !== 0),
    // Ids repeat across projects, so the source key travels with the selection.
    selectedIds: plans.filter((plan) => plan.selected).map((plan) => `${plan.entry.sourceKey}:${plan.memory.id}`),
  };
}

function assertBudget(value: number, scope: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new MemoryError('INVALID_BUDGET', `${scope}: budgetBytes must be a finite non-negative byte count, received ${String(value)}`);
  }
}

export function renderIndex(ranked: RankedMemory[], budgetBytes: number): IndexResult {
  assertBudget(budgetBytes, 'renderIndex');
  const budget = Math.floor(budgetBytes);
  const ordered = [...ranked].sort(compareRanked);
  const total = ordered.length;
  const plans = ordered.map(buildPlan);

  const header = indexHeader(0, total, false);
  const footer = utf8Bytes(header) + 1 + utf8Bytes(INDEX_FOOTER) + 1 <= budget ? INDEX_FOOTER : '';
  if (utf8Bytes(header) + 1 + utf8Bytes(footer) + 1 > budget) return { text: '', bytes: 0, remainingBytes: budget, total, shown: 0, selectedIds: [], truncated: total > 0 };
  const filled = fillIndex(plans, budget, header, footer);
  const shown = filled.shown;
  const truncated = shown < total || filled.anyShortened;
  const text = filled.text.replace(header, indexHeader(shown, total, truncated));
  const bytes = utf8Bytes(text);
  return {
    text,
    bytes,
    remainingBytes: budget - bytes,
    total,
    shown,
    selectedIds: filled.selectedIds,
    truncated,
  };
}

/* ------------------------------------------------------------------ */
/* body rendering                                                      */
/* ------------------------------------------------------------------ */

const MIN_BODY_BYTES = 24;

function cutAtSentence(text: string, maxBytes: number): string {
  if (maxBytes <= 0) return '';
  const prefixes = sentencePrefixes(text);
  for (let index = prefixes.length - 1; index >= 0; index -= 1) {
    const prefix = prefixes[index]!;
    if (utf8Bytes(prefix) <= maxBytes) return prefix;
  }
  return byteSafePrefix(text, maxBytes);
}

/** Whole paragraphs first, then a whole sentence, then a code-point-safe cut. */
function truncateBody(text: string, maxBytes: number): string {
  if (maxBytes <= 0) return '';
  if (utf8Bytes(text) <= maxBytes) return text;
  const blocks = text.split(/\n{2,}/);
  let out = '';
  for (const block of blocks) {
    const paragraph = block.trim();
    if (paragraph === '') continue;
    const candidate = out === '' ? paragraph : `${out}\n\n${paragraph}`;
    if (utf8Bytes(candidate) <= maxBytes) {
      out = candidate;
      continue;
    }
    const room = maxBytes - (out === '' ? 0 : utf8Bytes(out) + 2);
    const cut = cutAtSentence(paragraph, room);
    if (cut !== '') out = out === '' ? cut : `${out}\n\n${cut}`;
    break;
  }
  return out;
}

/**
 * Render full bodies only for entries with a positive score, capped by maxCount
 * and by the byte budget. Filling the index never implies reading bodies.
 * Granted projects obey the same CROSS_PROJECT_SHARE cap as the index.
 */
export function renderBodies(ranked: RankedMemory[], budgetBytes: number, maxCount: number): string {
  assertBudget(budgetBytes, 'renderBodies');
  if (!Number.isInteger(maxCount) || maxCount < 0) {
    throw new MemoryError('INVALID_MAX_COUNT', `renderBodies: maxCount must be a non-negative integer, received ${String(maxCount)}`);
  }
  const budget = Math.floor(budgetBytes);
  if (budget <= 0 || maxCount === 0) return '';

  const ordered = [...ranked].sort(compareRanked).filter((entry) => entry.score > 0).slice(0, maxCount);
  const grantedBudget = Math.floor(budget * CROSS_PROJECT_SHARE);
  const sections: string[] = [];
  let used = 0;
  let grantedUsed = 0;

  for (const entry of ordered) {
    const memory = entry.memory;
    const link = linkOf(entry);
    const header = `## ${escapeContext(flattenOneLine(memory.title ?? '') || memory.name)} [${link}](${link})`;
    const body = escapeContext(memory.body ?? '').trim();
    const separator = sections.length > 0 ? 2 : 0;
    // A granted entry only sees the room left under the shared cap.
    const sectionBudget = entry.origin === 'granted'
      ? Math.min(budget - used, grantedBudget - grantedUsed)
      : budget - used;
    if (sectionBudget <= separator) continue;

    const full = body === '' ? header : `${header}\n${body}`;
    if (separator + utf8Bytes(full) <= sectionBudget) {
      sections.push(full);
      used += separator + utf8Bytes(full);
      if (entry.origin === 'granted') grantedUsed += utf8Bytes(full);
      continue;
    }
    if (body === '') continue;

    const hint = entry.origin === 'granted' && entry.sourceHandle
      ? `\n\n[truncated - md_memory_read scope="project" project="${entry.sourceHandle}" name="${memory.name}" for the remaining text]`
      : `\n\n[truncated - md_memory_read ${link} for the remaining text]`;
    const available = sectionBudget - separator - utf8Bytes(header) - 1 - utf8Bytes(hint);
    if (available < MIN_BODY_BYTES) continue;
    const cut = truncateBody(body, available);
    if (cut === '') continue;
    const section = `${header}\n${cut}${hint}`;
    if (separator + utf8Bytes(section) > sectionBudget) continue;
    sections.push(section);
    used += separator + utf8Bytes(section);
    if (entry.origin === 'granted') grantedUsed += utf8Bytes(section);
  }

  return sections.join('\n\n');
}
