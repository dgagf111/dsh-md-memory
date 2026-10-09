import { createHash } from 'node:crypto';
import type { MemoryStore } from './store.js';
import type { Checkpoint, Logger, Memory, MemoryScope, MemoryType, ProjectIdentity, WriteInput } from './types.js';
import { MemoryError } from './types.js';
import { validateWrite } from './codec.js';
import { EXTRACTION_POLICY } from './prompts.js';
import { rankMemories } from './retrieval.js';

export interface ExtractionMessage { id: string; seq: number; role: 'user' | 'assistant'; text: string; }
export interface ExtractionTask {
  session: string; turn: number; boundary: number; project?: ProjectIdentity;
  messages: ExtractionMessage[]; observedAt: string; provider?: string; model?: string;
}
export type Completion = (task: ExtractionTask, system: string, input: string, signal: AbortSignal) => Promise<string>;
export interface ExtractionStatus { state: 'idle' | 'queued' | 'running' | 'failed' | 'completed'; turn?: number; lastError?: string; }
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
      let checkpoint: Checkpoint | undefined;
      try {
        checkpoint = await this.store.checkpoint(task.project, session);
        const fresh = task.messages.filter(m => m.seq > checkpoint!.boundary && m.seq <= task.boundary);
        const eligible = fresh.some(m => m.role === 'user' && m.text.trim().length > 0);
        if (!eligible) {
          await this.store.saveCheckpoint(task.project, session, { boundary: Math.max(checkpoint.boundary, task.boundary), lastSuccess: new Date().toISOString() });
          this.states.set(session, { state: 'completed', turn: task.turn });
          this.logger.debug({ event: 'extraction.skipped', session, reason: 'no-new-user-content' });
          continue;
        }
        if (!task.provider || !task.model) throw new MemoryError('NO_MODEL_ROUTE', 'Configure extraction provider/model or select a session model.');
        this.states.set(session, { state: 'running', turn: task.turn });
        const snapshot = await this.store.snapshot(task.project);
        const payload = this.payload(fresh, snapshot.memories, session);
        this.logger.debug({ event: 'extraction.input', session, bytes: Buffer.byteLength(payload), messages: fresh.length });
        if (Buffer.byteLength(payload) > 128 * 1024) throw new MemoryError('EXTRACTION_INPUT_TOO_LARGE', 'Extraction window exceeds 128 KiB. Compact the conversation or process a smaller window.');
        let output: Proposal[] | undefined;
        for (let attempt = 1; attempt <= this.attempts; attempt++) {
          this.controller.signal.throwIfAborted();
          try {
            this.logger.info({ event: 'extraction.started', session, project: task.project?.id, turn: task.turn, attempt, messages: fresh.length, provider: task.provider, model: task.model });
            output = proposals(await this.completion(task, EXTRACTION_POLICY.replace('最多 5 个操作', `最多 ${this.maximum} 个操作`), payload, this.controller.signal), this.maximum);
            break;
          } catch (error) {
            this.logger.error({ event: 'extraction.attempt_failed', session, turn: task.turn, attempt }, error);
            if (attempt === this.attempts || this.controller.signal.aborted) throw error;
            await new Promise<void>(resolve => setTimeout(resolve, 200 * attempt));
          }
        }
        for (const proposal of output!) {
          const operationId = createHash('sha256').update(`${session}:${task.boundary}:${proposal.action}:${proposal.scope}:${proposal.name}`).digest('hex');
          if (proposal.action === 'forget') throw new MemoryError('EXTRACTION_FORGET_UNSUPPORTED', 'Explicit forgetting must be committed by the main agent memory tool.');
          const existing = snapshot.memories.find(m => m.scope === proposal.scope && m.name === proposal.name);
          const input: WriteInput = {
            name: proposal.name, scope: proposal.scope, title: proposal.title!, description: proposal.description!, type: proposal.type!, body: proposal.body!,
            source: { session, turn: task.turn, kind: 'extraction' }, operationId, observedAt: task.observedAt,
            ...(proposal.tags ? { tags: proposal.tags } : {}), ...(proposal.aliases ? { aliases: proposal.aliases } : {}), ...(proposal.paths ? { paths: proposal.paths } : {}),
            ...(existing ? { expectedRevision: proposal.expectedRevision, expectedHash: proposal.expectedHash } : {}),
          };
          validateWrite(input);
          await this.store.write(input, task.project, this.controller.signal);
        }
        await this.store.saveCheckpoint(task.project, session, { boundary: task.boundary, lastSuccess: new Date().toISOString() });
        this.states.set(session, { state: 'completed', turn: task.turn });
        this.logger.info({ event: 'extraction.completed', session, turn: task.turn, operations: output!.length });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.states.set(session, { state: 'failed', turn: task.turn, lastError: message });
        this.logger.error({ event: 'extraction.failed', session, project: task.project?.id, turn: task.turn }, error);
        if (checkpoint) {
          try { await this.store.saveCheckpoint(task.project, session, { ...checkpoint, lastError: message }); }
          catch (checkpointError) { this.logger.error({ event: 'extraction.checkpoint_failed', session }, checkpointError); }
        }
      }
    }
  }
  private payload(messages: ExtractionMessage[], memories: Memory[], session: string): string {
    // The full library remains on disk. Extraction gets a short candidate list,
    // with related bodies within their own budget, rather than every stored body.
    const ranked = rankMemories(memories, { current: messages.filter(m => m.role === 'user').map(m => m.text).join('\n'), recent: [], touchedPaths: [] });
    const entries: Record<string, unknown>[] = [];
    let indexBytes = 0, bodyBytes = 0;
    for (const item of ranked) {
      const m = item.memory;
      const entry: Record<string, unknown> = { scope: m.scope, name: m.name, title: m.title, description: m.description, revision: m.revision, hash: m.hash };
      const size = Buffer.byteLength(JSON.stringify(entry)) + 1;
      if (indexBytes + size > 32768) continue;
      indexBytes += size;
      const bodySize = Buffer.byteLength(JSON.stringify(m.body)) + 8;
      if (item.score > 0 && bodyBytes + bodySize <= 32768) { entry.body = m.body; bodyBytes += bodySize; }
      entries.push(entry);
    }
    this.logger.debug({ event: 'extraction.candidates', session, total: memories.length, shown: entries.length, indexBytes, bodyBytes });
    return JSON.stringify({ newMessages: messages, existingTotal: memories.length, existingShown: entries.length, existingMemories: entries });
  }
}
