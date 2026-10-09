import { createHash } from 'node:crypto';
import type { MemoryStore } from './store.js';
import type { Checkpoint, Logger, Memory, MemoryScope, MemoryType, ProjectIdentity, WriteInput } from './types.js';
import { MemoryError } from './types.js';
import { digest, validateWrite } from './codec.js';
import { EXTRACTION_POLICY } from './prompts.js';
import { rankMemories } from './retrieval.js';

export interface ExtractionMessage { id: string; seq: number; role: 'user' | 'assistant'; text: string; }
export interface ExtractionTask {
  session: string; turn: number; boundary: number; project?: ProjectIdentity;
  messages: ExtractionMessage[]; observedAt: string; provider?: string; model?: string;
}
export type Completion = (task: ExtractionTask, system: string, input: string, signal: AbortSignal) => Promise<string>;
/** One proposal that was deliberately refused, with the reason surfaced in logs and status. */
export interface ExtractionSkip { action: 'write' | 'forget'; scope: MemoryScope; name: string; code: string; reason: string; }
export interface ExtractionStatus {
  state: 'idle' | 'queued' | 'running' | 'failed' | 'completed'; turn?: number; lastError?: string;
  /** Number of committed batches of the last run. */
  batches?: number;
  /** Per-operation refusals of the last run: they never fail the whole batch. */
  skipped?: ExtractionSkip[];
}
interface Proposal {
  action: 'write' | 'forget'; name: string; scope: MemoryScope; title?: string; description?: string; type?: MemoryType; body?: string;
  tags?: string[]; aliases?: string[]; paths?: string[]; expectedRevision?: number; expectedHash?: string;
}
function proposals(text: string, maximum: number): Proposal[] {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch (error) { throw new MemoryError('INVALID_EXTRACTION_JSON', 'Extraction returned invalid JSON.', { cause: error }); }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { operations?: unknown }).operations)) throw new MemoryError('INVALID_EXTRACTION_JSON', 'Expected an operations array.');
  const operations = (parsed as { operations: unknown[] }).operations;
  if (operations.length > maximum) throw new MemoryError('EXTRACTION_LIMIT', `Extraction returned more than ${maximum} operations.`);
  return operations.map(operation => {
    if (!operation || typeof operation !== 'object') throw new MemoryError('INVALID_EXTRACTION_OPERATION', 'Operation must be an object.');
    const p = operation as Proposal;
    if (!['write', 'forget'].includes(p.action) || !['user', 'project'].includes(p.scope) || typeof p.name !== 'string') throw new MemoryError('INVALID_EXTRACTION_OPERATION', 'Invalid operation action, scope, or name.');
    for (const field of ['tags', 'aliases', 'paths'] as const) if (p[field] !== undefined && (!Array.isArray(p[field]) || p[field]!.some(v => typeof v !== 'string'))) throw new MemoryError('INVALID_EXTRACTION_OPERATION', `${field} must be a string array.`);
    return p;
  });
}

/* ------------------------------------------------------------------ */
/* byte budgets                                                        */
/* ------------------------------------------------------------------ */

/** Hard ceiling for one extraction request, measured on the serialised JSON. */
const MAX_INPUT_BYTES = 128 * 1024;
/** Candidates: index lines, related bodies and disabled entries each get a reserve. */
const CANDIDATE_INDEX_BYTES = 32 * 1024;
const CANDIDATE_BODY_BYTES = 32 * 1024;
const CANDIDATE_DISABLED_BYTES = 8 * 1024;
/** Room for the JSON envelope around the fragments and candidates. */
const ENVELOPE_BYTES = 4 * 1024;
/**
 * Fixed per-batch message budget, deliberately independent of the candidate
 * snapshot: a retry after a partially committed batch must fragment the same
 * content identically, or the operation ids anchored on the batch cursor would
 * change and the retry could duplicate a write it already committed.
 */
const MESSAGE_BUDGET_BYTES = MAX_INPUT_BYTES - CANDIDATE_INDEX_BYTES - CANDIDATE_BODY_BYTES - CANDIDATE_DISABLED_BYTES - ENVELOPE_BYTES;
/** One fragment plus its JSON envelope always fits a single batch. */
const FRAGMENT_BUDGET_BYTES = MESSAGE_BUDGET_BYTES - 512;
/**
 * Refusals that belong to one proposal. They are recorded and skipped so a
 * single disabled target or stale revision cannot block the rest of the window.
 * Anything else (IO, damaged journals, aborted signals) still fails the batch.
 */
const REJECTED_OPERATIONS = new Set([
  'REVISION_CONFLICT', 'FORGOTTEN_MEMORY', 'DISABLED_TARGET', 'DISABLED_MEMORY', 'EXTRACTION_FORGET_UNSUPPORTED',
  'INVALID_INPUT', 'INVALID_NAME', 'SENSITIVE_CONTENT', 'FILE_TOO_LARGE',
]);

/* ------------------------------------------------------------------ */
/* code-point and JSON byte helpers                                    */
/* ------------------------------------------------------------------ */

function utf8CharBytes(char: string): number {
  const code = char.codePointAt(0)!;
  return code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
}
/** Exact byte length of one code point once JSON.stringify escapes it. */
function jsonCharBytes(char: string): number {
  if (char === '"' || char === '\\' || char === '\n' || char === '\r' || char === '\t' || char === '\b' || char === '\f') return 2;
  const code = char.codePointAt(0)!;
  if (code < 0x20 || (code >= 0xd800 && code <= 0xdfff)) return 6;
  return code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
}
function utf8Length(text: string): number {
  let bytes = 0;
  for (const char of text) bytes += utf8CharBytes(char);
  return bytes;
}
interface Piece { text: string; start: number; end: number; }
/**
 * Split text by actual JSON byte cost on code-point boundaries, so a fragment
 * never contains half a surrogate pair and never exceeds its budget.
 * `start`/`end` are raw UTF-8 byte offsets inside the original message.
 */
function pieces(text: string, maximum: number): Piece[] {
  if (text === '') return [{ text, start: 0, end: 0 }];
  const out: Piece[] = [];
  let buffer = '', escaped = 0, start = 0, cursor = 0;
  for (const char of text) {
    const json = jsonCharBytes(char), raw = utf8CharBytes(char);
    if (buffer !== '' && escaped + json > maximum) {
      out.push({ text: buffer, start, end: cursor });
      start = cursor; buffer = ''; escaped = 0;
    }
    buffer += char; escaped += json; cursor += raw;
  }
  if (buffer !== '') out.push({ text: buffer, start, end: cursor });
  return out;
}
/** The code-point prefix of `text` whose UTF-8 length is exactly `offset`. */
function prefixAtByte(text: string, offset: number): { text: string; bytes: number } | undefined {
  if (offset < 0) return undefined;
  if (offset === 0) return { text: '', bytes: 0 };
  let bytes = 0, out = '';
  for (const char of text) {
    const size = utf8CharBytes(char);
    if (bytes + size > offset) return undefined;
    bytes += size; out += char;
    if (bytes === offset) return { text: out, bytes };
  }
  return undefined;
}

/** One message ready for fragmentation; `skip` is the already committed byte prefix. */
interface PendingMessage { id: string; seq: number; role: 'user' | 'assistant'; text: string; skip: number; total: number; }
/** One outgoing message fragment with its exact serialised form. */
interface Fragment { json: string; bytes: number; seq: number; role: 'user' | 'assistant'; text: string; start: number; end: number; total: number; source: string; }

/**
 * Fragments every pending message on code-point boundaries within the JSON byte
 * budget, dropping the prefix the checkpoint already committed. Splitting is a
 * pure function of the full message text, so the same message always yields the
 * same fragments and the same part/parts labels, even after a resumed run.
 */
function fragmentsOf(messages: readonly PendingMessage[]): Fragment[] {
  const out: Fragment[] = [];
  for (const message of messages) {
    const parts = pieces(message.text, FRAGMENT_BUDGET_BYTES);
    for (let index = 0; index < parts.length; index++) {
      const piece = parts[index]!;
      if (message.skip > 0 && piece.end <= message.skip) continue;
      let text = piece.text;
      let start = piece.start;
      if (start < message.skip) {
        const head = prefixAtByte(text, message.skip - start);
        if (!head) throw new MemoryError('EXTRACTION_CHUNK_INVALID', `Committed offset ${message.skip} is not a code-point boundary of message ${message.seq}.`);
        text = text.slice(head.text.length);
        start = message.skip;
      }
      const json = JSON.stringify({ id: message.id, seq: message.seq, role: message.role, text, ...(parts.length > 1 ? { part: index + 1, parts: parts.length } : {}) });
      out.push({ json, bytes: Buffer.byteLength(json), seq: message.seq, role: message.role, text, start, end: piece.end, total: message.total, source: message.text });
    }
  }
  return out;
}

/**
 * Stable identity of one batch for operation ids: the cursor the batch starts
 * from. A whole-turn boundary is not enough, because several batches of the same
 * turn that touch the same name would then be deduplicated as one operation.
 */
function batchIdentity(session: string, project: string | undefined, first: Fragment): string {
  return createHash('sha256').update(`${session}\n${project ?? 'user'}\n${first.seq}:${first.start}`).digest('hex').slice(0, 24);
}

export class ExtractionScheduler {
  private pending = new Map<string, ExtractionTask>();
  private running?: Promise<void>;
  private controller = new AbortController();
  private states = new Map<string, ExtractionStatus>();
  constructor(private store: MemoryStore, private completion: Completion, private logger: Logger, private maximum = 5, private attempts = 2) {}
  status(session: string): ExtractionStatus { return this.states.get(session) ?? { state: 'idle' }; }
  configure(maximum: number, attempts: number): void { this.maximum = maximum; this.attempts = attempts; }
  cancelQueued(): void {
    for (const session of this.pending.keys()) this.states.set(session, { state: 'idle' });
    this.pending.clear();
  }
  schedule(task: ExtractionTask): void {
    if (this.controller.signal.aborted) throw new MemoryError('EXTRACTION_DISPOSED', 'Memory extraction scheduler is stopped.');
    this.pending.set(task.session, task);
    this.states.set(task.session, { state: 'queued', turn: task.turn });
    this.logger.debug({ event: 'extraction.queued', session: task.session, project: task.project?.id, turn: task.turn, boundary: task.boundary, messages: task.messages.length });
    if (!this.running) this.launch();
  }
  private launch(): void {
    this.running = this.run().finally(() => {
      this.running = undefined;
      if (this.pending.size && !this.controller.signal.aborted) this.launch();
    });
  }
  async drain(): Promise<void> { while (this.running) await this.running; }
  async stop(): Promise<void> { this.controller.abort(); this.pending.clear(); await this.drain(); }
  private async run(): Promise<void> {
    while (this.pending.size && !this.controller.signal.aborted) {
      const [session, task] = this.pending.entries().next().value!;
      this.pending.delete(session);
      await this.extract(session, task);
    }
  }
  private async extract(session: string, task: ExtractionTask): Promise<void> {
    const skipped: ExtractionSkip[] = [];
    let committed: Checkpoint = { boundary: -1 };
    let batches = 0;
    try {
      const checkpoint = await this.store.checkpoint(task.project, session);
      committed = this.cursor(checkpoint);
      const fresh = task.messages.filter(m => m.seq > checkpoint.boundary && m.seq <= task.boundary).sort((a, b) => a.seq - b.seq);
      const pending = this.pendingMessages(checkpoint, fresh, session);
      const segments = fragmentsOf(pending);
      const continuing = (checkpoint.pendingBoundary ?? checkpoint.boundary) > checkpoint.boundary;
      if (segments.length === 0 || (!continuing && !segments.some(segment => segment.role === 'user' && segment.text.trim().length > 0))) {
        // A stale task may sit behind a half-committed message: keep the offset
        // until the boundary actually reaches it, so the remainder is never lost.
        const target = Math.max(checkpoint.boundary, task.boundary);
        const keep = (committed.offsetSeq !== undefined && target < committed.offsetSeq)
          || (committed.pendingBoundary !== undefined && target < committed.pendingBoundary);
        const value: Checkpoint = keep ? { ...committed, boundary: target } : { boundary: target };
        value.lastSuccess = new Date().toISOString();
        await this.persist(task.project, session, value);
        this.states.set(session, { state: 'completed', turn: task.turn });
        this.logger.debug({ event: 'extraction.skipped', session, reason: 'no-new-user-content' });
        return;
      }
      if (!task.provider || !task.model) throw new MemoryError('NO_MODEL_ROUTE', 'Configure extraction provider/model or select a session model.');
      this.states.set(session, { state: 'running', turn: task.turn });
      committed.pendingBoundary = Math.max(task.boundary, checkpoint.pendingBoundary ?? task.boundary);
      this.logger.debug({ event: 'extraction.segmented', session, pending: pending.length, fragments: segments.length, messageBytes: segments.reduce((sum, segment) => sum + segment.bytes, 0), budgetBytes: MESSAGE_BUDGET_BYTES });
      let index = 0, operations = 0;
      while (index < segments.length) {
        this.controller.signal.throwIfAborted();
        const batch = this.batch(segments, index);
        // Rebuild the candidate list per batch: later batches must see the
        // revisions this run already committed, or CAS rejects every update.
        const memories = (await this.store.snapshot(task.project, true)).memories;
        let input = this.input(batch, memories, session);
        while (Buffer.byteLength(input) > MAX_INPUT_BYTES && batch.length > 1) {
          batch.pop();
          input = this.input(batch, memories, session);
        }
        if (Buffer.byteLength(input) > MAX_INPUT_BYTES) throw new MemoryError('EXTRACTION_INPUT_TOO_LARGE', 'A single extraction fragment exceeds the request budget.');
        this.logger.debug({ event: 'extraction.input', session, bytes: Buffer.byteLength(input), fragments: batch.length, batch: batches + 1, remaining: segments.length - index });
        const output = await this.complete(task, input);
        operations += await this.apply(task, session, batch, memories, output, skipped);
        committed = { ...this.advance(committed, batch), pendingBoundary: committed.pendingBoundary };
        // Persist progress once the whole batch is committed, so a later failure
        // resumes here instead of redoing or skipping this content.
        await this.persist(task.project, session, { ...committed, lastSuccess: new Date().toISOString() });
        batches += 1;
        index += batch.length;
      }
      const completedBoundary = Math.max(committed.boundary, task.boundary);
      await this.persist(task.project, session, { boundary: completedBoundary,
        ...(committed.pendingBoundary! > completedBoundary ? { pendingBoundary: committed.pendingBoundary } : {}), lastSuccess: new Date().toISOString() });
      this.states.set(session, { state: 'completed', turn: task.turn, batches, ...(skipped.length ? { skipped } : {}) });
      this.logger.info({ event: 'extraction.completed', session, turn: task.turn, batches, operations, skipped: skipped.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.states.set(session, { state: 'failed', turn: task.turn, lastError: message, ...(batches ? { batches } : {}), ...(skipped.length ? { skipped } : {}) });
      this.logger.error({ event: 'extraction.failed', session, project: task.project?.id, turn: task.turn }, error);
      try { await this.persist(task.project, session, { ...committed, lastError: message }); }
      catch (checkpointError) { this.logger.error({ event: 'extraction.checkpoint_failed', session }, checkpointError); }
    }
  }
  /**
   * Messages still owed after the checkpoint. A checkpoint may stop inside the
   * first message (`offset` bytes committed); that prefix is dropped from the
   * fragments, so the remainder is neither re-extracted nor skipped. A checkpoint
   * whose offset no longer matches the text (compaction, edited message) resets
   * to the whole message rather than silently dropping committed content.
   */
  private pendingMessages(checkpoint: Checkpoint, fresh: readonly ExtractionMessage[], session: string): PendingMessage[] {
    const whole = fresh.map(message => ({ ...message, skip: 0, total: utf8Length(message.text) }));
    const raw = checkpoint.offset;
    const offset = typeof raw === 'number' && Number.isInteger(raw) && raw > 0 ? raw : 0;
    if (whole.length === 0 || offset === 0) return whole;
    const first = whole[0]!;
    const expected = checkpoint.offsetSeq ?? first.seq;
    const prefix = expected === first.seq ? prefixAtByte(first.text, offset) : undefined;
    // An offset that is not a code-point prefix of the current text, or that
    // claims the whole message, cannot be trusted: re-process the message rather
    // than skip content that may never have been extracted.
    if (!prefix || prefix.bytes >= first.total || (checkpoint.offsetHash !== undefined && checkpoint.offsetHash !== digest(prefix.text))) {
      this.logger.error({ event: 'extraction.chunk_reset', session, seq: first.seq, offset, reason: prefix ? 'hash-mismatch' : 'not-a-head' });
      return whole;
    }
    return [{ ...first, skip: prefix.bytes }, ...whole.slice(1)];
  }
  /**
   * Greedy batch of fragments that fits the fixed JSON byte budget. A fragment
   * that only covers part of its message ends the batch, so the persisted cursor
   * is always exactly the batch end and no committed fragment is ever resent.
   */
  private batch(segments: readonly Fragment[], from: number): Fragment[] {
    const out: Fragment[] = [];
    let bytes = 2;
    for (let index = from; index < segments.length; index++) {
      const segment = segments[index]!;
      const size = segment.bytes + (out.length > 0 ? 1 : 0);
      if (out.length > 0 && bytes + size > MESSAGE_BUDGET_BYTES) break;
      bytes += size;
      out.push(segment);
      if (segment.end < segment.total) break;
    }
    return out;
  }
  /** New cursor after a batch: the last fully covered message, or a mid-message offset. */
  private advance(checkpoint: Checkpoint, batch: readonly Fragment[]): Checkpoint {
    let boundary = checkpoint.boundary;
    for (const segment of batch) {
      if (segment.end >= segment.total) { boundary = Math.max(boundary, segment.seq); continue; }
      const prefix = prefixAtByte(segment.source, segment.end);
      if (!prefix) throw new MemoryError('EXTRACTION_CHUNK_INVALID', `Committed offset ${segment.end} is not a code-point boundary of message ${segment.seq}.`);
      return { boundary, offset: prefix.bytes, offsetSeq: segment.seq, offsetHash: digest(prefix.text) };
    }
    return { boundary };
  }
  /** The resumable cursor of a checkpoint: progress only, never the last error. */
  private cursor(checkpoint: Checkpoint): Checkpoint {
    const value: Checkpoint = { boundary: checkpoint.boundary };
    if (checkpoint.pendingBoundary !== undefined) value.pendingBoundary = checkpoint.pendingBoundary;
    const offset = checkpoint.offset;
    if (typeof offset === 'number' && Number.isInteger(offset) && offset > 0) {
      value.offset = offset;
      if (checkpoint.offsetSeq !== undefined) value.offsetSeq = checkpoint.offsetSeq;
      if (checkpoint.offsetHash !== undefined) value.offsetHash = checkpoint.offsetHash;
    }
    return value;
  }
  private async persist(project: ProjectIdentity | undefined, session: string, checkpoint: Checkpoint): Promise<void> {
    const value = this.cursor(checkpoint);
    if (checkpoint.lastSuccess) value.lastSuccess = checkpoint.lastSuccess;
    if (checkpoint.lastError) value.lastError = checkpoint.lastError;
    await this.store.saveCheckpoint(project, session, value);
  }
  private async complete(task: ExtractionTask, input: string): Promise<Proposal[]> {
    let output: Proposal[] | undefined;
    const system = EXTRACTION_POLICY.replace('最多 5 个操作', `最多 ${this.maximum} 个操作`);
    for (let attempt = 1; attempt <= this.attempts; attempt++) {
      this.controller.signal.throwIfAborted();
      try {
        this.logger.info({ event: 'extraction.started', session: task.session, project: task.project?.id, turn: task.turn, attempt, bytes: Buffer.byteLength(input), provider: task.provider, model: task.model });
        output = proposals(await this.completion(task, system, input, this.controller.signal), this.maximum);
        break;
      } catch (error) {
        this.logger.error({ event: 'extraction.attempt_failed', session: task.session, turn: task.turn, attempt }, error);
        if (attempt === this.attempts || this.controller.signal.aborted) throw error;
        await new Promise<void>(resolve => setTimeout(resolve, 200 * attempt));
      }
    }
    return output!;
  }
  /** Applies one batch's proposals; per-operation refusals are recorded, not thrown. */
  private async apply(task: ExtractionTask, session: string, batch: readonly Fragment[], memories: readonly Memory[], output: readonly Proposal[], skipped: ExtractionSkip[]): Promise<number> {
    const identity = batchIdentity(session, task.project?.id, batch[0]!);
    const existing = new Map<string, Memory>();
    for (const memory of memories) existing.set(`${memory.scope}\n${memory.name}`, memory);
    let applied = 0;
    for (const proposal of output) {
      const key = `${proposal.scope}\n${proposal.name}`;
      const current = existing.get(key);
      const reject = (code: string, reason: string): void => {
        skipped.push({ action: proposal.action, scope: proposal.scope, name: proposal.name, code, reason });
        this.logger.error({ event: 'extraction.operation_skipped', session, action: proposal.action, scope: proposal.scope, name: proposal.name, code, reason });
      };
      if (proposal.action === 'forget') { reject('EXTRACTION_FORGET_UNSUPPORTED', 'Background extraction never forgets; the main agent tool does that explicitly.'); continue; }
      if (current?.status === 'disabled') { reject('DISABLED_TARGET', 'The candidate is disabled; background extraction must not modify or re-enable it.'); continue; }
      const operationId = createHash('sha256').update(`${identity}:${proposal.action}:${proposal.scope}:${proposal.name}`).digest('hex');
      const input: WriteInput = {
        name: proposal.name, scope: proposal.scope, title: proposal.title!, description: proposal.description!, type: proposal.type!, body: proposal.body!,
        source: { session, turn: task.turn, kind: 'extraction' }, operationId, observedAt: task.observedAt,
        ...(proposal.tags ? { tags: proposal.tags } : {}), ...(proposal.aliases ? { aliases: proposal.aliases } : {}), ...(proposal.paths ? { paths: proposal.paths } : {}),
        // CAS stays with the model's proposal. A stale or missing revision is a
        // conflict to report, never a licence to overwrite what was read here.
        ...(current ? { expectedRevision: proposal.expectedRevision, expectedHash: proposal.expectedHash } : {}),
      };
      try {
        validateWrite(input);
        existing.set(key, await this.store.write(input, task.project, this.controller.signal));
        applied += 1;
      } catch (error) {
        const code = error instanceof MemoryError ? error.code : undefined;
        if (code === undefined || !REJECTED_OPERATIONS.has(code)) throw error;
        reject(code, error instanceof Error ? error.message : String(error));
      }
    }
    return applied;
  }
  private input(batch: readonly Fragment[], memories: Memory[], session: string): string {
    const candidates = this.candidates(batch, memories, session);
    return `{"newMessages":[${batch.map(segment => segment.json).join(',')}],`
      + `"existingTotal":${memories.length},"existingShown":${candidates.entries.length},"existingDisabled":${candidates.disabled},`
      + `"existingMemories":[${candidates.entries.map(entry => JSON.stringify(entry)).join(',')}]}`;
  }
  private candidates(batch: readonly Fragment[], memories: Memory[], session: string): { entries: Record<string, unknown>[]; indexBytes: number; bodyBytes: number; disabled: number } {
    // The full library remains on disk. Extraction gets a short candidate list,
    // with related bodies within their own budget, rather than every stored body.
    const current = batch.filter(segment => segment.role === 'user').map(segment => segment.text).join('\n');
    const ranked = rankMemories(memories, { current, recent: [], touchedPaths: [] });
    const entries: Record<string, unknown>[] = [];
    let indexBytes = 0, bodyBytes = 0;
    for (const item of ranked) {
      const m = item.memory;
      const entry: Record<string, unknown> = { scope: m.scope, name: m.name, title: m.title, description: m.description, status: m.status, revision: m.revision, hash: m.hash };
      const size = Buffer.byteLength(JSON.stringify(entry)) + 1;
      if (indexBytes + size > CANDIDATE_INDEX_BYTES) continue;
      indexBytes += size;
      const bodySize = Buffer.byteLength(JSON.stringify(m.body)) + 8;
      if (item.score > 0 && bodyBytes + bodySize <= CANDIDATE_BODY_BYTES) { entry.body = m.body; bodyBytes += bodySize; }
      entries.push(entry);
    }
    // rankMemories hides disabled entries, but their names are taken. Without
    // them the model proposes a same-name write, which the store rejects as a
    // conflict and which used to fail the whole batch. They are listed with their
    // status and never receive a body.
    const disabled = memories.filter(memory => memory.status === 'disabled');
    let disabledBytes = 0, disabledShown = 0;
    for (const m of disabled) {
      const entry: Record<string, unknown> = { scope: m.scope, name: m.name, title: m.title, description: m.description, status: 'disabled', revision: m.revision, hash: m.hash };
      const size = Buffer.byteLength(JSON.stringify(entry)) + 1;
      if (disabledBytes + size > CANDIDATE_DISABLED_BYTES) break;
      disabledBytes += size; disabledShown += 1; entries.push(entry);
    }
    this.logger.debug({ event: 'extraction.candidates', session, total: memories.length, shown: entries.length, indexBytes, bodyBytes, disabled: disabled.length, disabledShown });
    return { entries, indexBytes, bodyBytes, disabled: disabled.length };
  }
}
