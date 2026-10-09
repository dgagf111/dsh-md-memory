export type MemoryScope = 'user' | 'project';
export type MemoryType = 'user' | 'feedback' | 'project' | 'reference';
/** Which memory block an entry came from: the user scope, this session's project, or a granted project. */
export type MemoryOrigin = 'user' | 'own' | 'granted';
export interface MemorySource { session: string; turn: number; kind: 'explicit-user' | 'agent' | 'extraction' | 'import'; }
export interface Memory {
  id: string; name: string; title: string; description: string; type: MemoryType;
  scope: MemoryScope; body: string; tags: string[]; aliases: string[]; paths: string[];
  created: string; modified: string; revision: number; pinned: boolean; status: 'active' | 'disabled';
  source: MemorySource; filePath: string; hash: string; operationId?: string;
  /** Directory identity the entry was loaded from: `user`, or a ProjectIdentity id. Never persisted. */
  sourceKey: string;
}
/** One readable memory block of the current session, as reported by md_memory_status. */
export type VisibleSource = { id: string; label: string; kind: MemoryOrigin };
export interface WriteInput {
  name: string; title: string; description: string; type: MemoryType; body: string;
  scope: MemoryScope; source: MemorySource; tags?: string[]; aliases?: string[]; paths?: string[];
  pinned?: boolean; status?: 'active' | 'disabled'; expectedRevision?: number; expectedHash?: string;
  operationId?: string; observedAt?: string;
}
export interface ProjectIdentity { id: string; cwd: string; root: string; kind: 'git' | 'directory'; }
/** One resolved memory scope: `user`, or a known project identity. */
export interface MemoryPlace { scope: MemoryScope; project?: ProjectIdentity; }
export interface RetrievalQuery { current: string; recent: string[]; touchedPaths: string[]; }
export interface RankedMemory { memory: Memory; score: number; currentScore: number; historyScore: number; pathScore: number; matchedTerms: string[];
  /** Source of this entry, used for budget guarding and for the link printed in the index. */
  sourceKey: string; origin: MemoryOrigin; sourceHandle?: string; }
export interface IndexResult { text: string; bytes: number; remainingBytes: number; total: number; shown: number; selectedIds: string[]; truncated: boolean; }
export interface Diagnostic { code: string; path: string; message: string; }
export interface Snapshot { memories: Memory[]; diagnostics: Diagnostic[]; }
export interface LogRecord { event: string; session?: string; project?: string; operation?: string; [key: string]: unknown; }
export interface Logger { debug(record: LogRecord): void; info(record: LogRecord): void; error(record: LogRecord, error?: unknown): void; flush(): Promise<void>; }
export interface Checkpoint {
  boundary: number; lastSuccess?: string; lastError?: string;
  /**
   * Raw UTF-8 bytes of the first message after `boundary` whose content was
   * already committed, so an oversized window resumes mid-message instead of
   * skipping it or extracting it twice. Absent (or 0) on legacy checkpoints.
   */
  offset?: number;
  /** Sequence number of the message `offset` belongs to. */
  offsetSeq?: number;
  /** Digest of the committed prefix; a changed window restarts instead of skipping text. */
  offsetHash?: string;
  /** End of a user-triggered window still being processed across batches. */
  pendingBoundary?: number;
}
export class MemoryError extends Error {
  constructor(public readonly code: string, message: string, options?: ErrorOptions) { super(message, options); this.name = 'MemoryError'; }
}
