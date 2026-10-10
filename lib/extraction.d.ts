import type { MemoryStore } from './store.js';
import type { Logger, MemoryScope, ProjectIdentity } from './types.js';
export interface ExtractionMessage {
    id: string;
    seq: number;
    role: 'user' | 'assistant';
    text: string;
}
export interface ExtractionTask {
    session: string;
    turn: number;
    boundary: number;
    project?: ProjectIdentity;
    messages: ExtractionMessage[];
    observedAt: string;
    provider?: string;
    model?: string;
}
export type Completion = (task: ExtractionTask, system: string, input: string, signal: AbortSignal) => Promise<string>;
/** One proposal that was deliberately refused, with the reason surfaced in logs and status. */
export interface ExtractionSkip {
    action: 'write' | 'forget';
    scope: MemoryScope;
    name: string;
    code: string;
    reason: string;
}
export interface ExtractionStatus {
    state: 'idle' | 'queued' | 'running' | 'failed' | 'completed';
    turn?: number;
    lastError?: string;
    /** Number of committed batches of the last run. */
    batches?: number;
    /** Per-operation refusals of the last run: they never fail the whole batch. */
    skipped?: ExtractionSkip[];
}
export declare class ExtractionScheduler {
    private store;
    private completion;
    private logger;
    private maximum;
    private attempts;
    private pending;
    private running?;
    private controller;
    private states;
    constructor(store: MemoryStore, completion: Completion, logger: Logger, maximum?: number, attempts?: number);
    status(session: string): ExtractionStatus;
    configure(maximum: number, attempts: number): void;
    cancelQueued(): void;
    /**
     * Drops the queued extraction of one project whose memory was just erased.
     * A task already running is not interrupted: it may still commit its current
     * batch, which the management page reports as a possible late write.
     */
    cancelProject(projectId: string): number;
    schedule(task: ExtractionTask): void;
    private launch;
    drain(): Promise<void>;
    stop(): Promise<void>;
    private run;
    private extract;
    /**
     * Messages still owed after the checkpoint. A checkpoint may stop inside the
     * first message (`offset` bytes committed); that prefix is dropped from the
     * fragments, so the remainder is neither re-extracted nor skipped. A checkpoint
     * whose offset no longer matches the text (compaction, edited message) resets
     * to the whole message rather than silently dropping committed content.
     */
    private pendingMessages;
    /**
     * Greedy batch of fragments that fits the fixed JSON byte budget. A fragment
     * that only covers part of its message ends the batch, so the persisted cursor
     * is always exactly the batch end and no committed fragment is ever resent.
     */
    private batch;
    /** New cursor after a batch: the last fully covered message, or a mid-message offset. */
    private advance;
    /** The resumable cursor of a checkpoint: progress only, never the last error. */
    private cursor;
    private persist;
    private complete;
    /** Applies one batch's proposals; per-operation refusals are recorded, not thrown. */
    private apply;
    private input;
    private candidates;
}
