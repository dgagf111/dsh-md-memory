import { type Logger, type Memory, type MemoryPlace, type MemoryScope, type ProjectIdentity, type Snapshot, type WriteInput } from './types.js';
/** Every project directory known to this memory root, valid ones and broken ones. */
export interface ProjectRegistry {
    projects: ProjectIdentity[];
    invalid: {
        id: string;
        message: string;
    }[];
}
export declare class MemoryStore {
    readonly root: string;
    readonly logger: Logger;
    constructor(root: string, logger: Logger);
    directory(scope: MemoryScope, project?: ProjectIdentity): string;
    /** Reads and validates one project directory's PROJECT.md. */
    project(id: string): Promise<ProjectIdentity>;
    /** Enumerates project scopes for the management page and for cross-project grants. */
    projects(): Promise<ProjectRegistry>;
    initializeProject(project: ProjectIdentity): Promise<void>;
    /**
     * Writes `PROJECT.md` when it is missing and validates it otherwise. Called
     * on initialization and before every project-scope write, so a session that
     * stayed bound to a workspace whose project was deleted from the memory page
     * recreates a valid, empty project instead of a directory without identity.
     */
    private ensureIdentity;
    private optional;
    private files;
    snapshot(project?: ProjectIdentity, includeDisabled?: boolean, extra?: readonly ProjectIdentity[]): Promise<Snapshot>;
    read(scope: MemoryScope, name: string, project?: ProjectIdentity): Promise<Memory>;
    write(input: WriteInput, project?: ProjectIdentity, signal?: AbortSignal): Promise<Memory>;
    forget(scope: MemoryScope, name: string, project?: ProjectIdentity, signal?: AbortSignal, expected?: {
        revision: number;
        hash: string;
    }): Promise<void>;
    /**
     * Erases one project's memory as a whole: entries, revision history, forgotten
     * markers, pending journals and anything else left in the scope directory
     * (including the `state/` checkpoints written by versions up to 0.6.0).
     * `PROJECT.md` survives, so the project keeps its identity in the management
     * page, and the index is rebuilt empty. There is no undo, so only the
     * management page calls this, after an explicit confirmation; the user scope
     * is never a reset target.
     */
    reset(project: ProjectIdentity, signal?: AbortSignal): Promise<{
        removed: number;
    }>;
    /**
     * Deletes one whole project scope. Unlike `reset`, which keeps `PROJECT.md`
     * and an empty index so the project stays in the page, this removes the
     * project directory itself and the library stops listing it.
     *
     * Only an already cleared scope may be deleted: as long as one entry file is
     * left the call is refused, so the two management actions keep a fixed order
     * (clear, then delete) and the destructive step can never take unsaved
     * memories with it. The same child-by-child deletion as `reset` is used, and
     * only the scope directory itself is dropped after the lock is released —
     * `withDirectoryLock` verifies and removes its own lock file at the end of
     * the critical section, so the lock must outlive it. A session that stays
     * bound to the workspace recreates an empty project on its next write.
     */
    removeProject(project: ProjectIdentity, signal?: AbortSignal): Promise<void>;
    /**
     * Moves one memory to another scope: user, another project, or this project.
     * Content, name, creation date and revision survive; an existing entry with the
     * same name in the destination is never overwritten. The source keeps a
     * forgotten marker, so a later inferred write cannot quietly bring the entry
     * back into the scope it was moved out of.
     */
    move(name: string, from: MemoryPlace, to: MemoryPlace, expected?: {
        revision: number;
        hash: string;
    }, signal?: AbortSignal): Promise<Memory>;
    /** Both scope locks must be held by the caller. */
    private applyMove;
    private withMoveRecovery;
    private recoverMoves;
    private commit;
    private applyTransaction;
    private recover;
    private rebuildIndex;
    recoverAll(project?: ProjectIdentity): Promise<void>;
}
