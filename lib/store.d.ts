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
