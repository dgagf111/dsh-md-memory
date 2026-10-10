import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { MemoryStore } from './store.js';
import { type ResolvedAccess } from './access.js';
import { type PluginConfig } from './config.js';
import { type ProjectIdentity, type RetrievalQuery, type Snapshot, type IndexResult } from './types.js';
interface AgentState {
    project?: ProjectIdentity;
    query: RetrievalQuery;
    snapshot: Snapshot;
    index?: IndexResult;
    bodies: string;
    turn: number;
    error?: string;
    access?: ResolvedAccess;
    handles: Record<string, string>;
    claimedInputs: string[];
}
/** DSH adapter; storage and ranking remain independent of the host. */
export declare class MemoryRuntime {
    readonly ctx: Context;
    readonly config: PluginConfig;
    readonly logger: import("./types.js").Logger;
    readonly store: MemoryStore;
    private states;
    private initializing;
    readonly profileConfig: PluginConfig;
    /** Default sources for projects absent from the matrix; seeded once from a legacy recallUser:false. */
    legacySources: string[];
    constructor(ctx: Context, config: PluginConfig, profileConfig?: PluginConfig, legacySources?: readonly string[]);
    private initialize;
    private failed;
    /**
     * Re-resolves the readable memory blocks and rebuilds the injected context.
     * Called on every step, so a settings save lands on the next model request.
     */
    private refresh;
    /**
     * Read visibility of one entry. The matrix decides the user scope and which
     * other projects are readable; `recallProject` stays an automatic-context
     * toggle for the current project only. A failed refresh keeps the old default
     * so a transient error never hides the user scope.
     */
    private visible;
    private projectInfo;
    /**
     * Resolves the [[name]] links of one body against every readable block. Links
     * are a convention, not a stored relation, so a target that was renamed or
     * forgotten is reported as exists:false instead of dead-ending silently. The
     * snapshot is refreshed after every write, forget and step, so a link to an
     * entry committed moments ago already resolves.
     */
    private links;
    /** Resolves an optional project reference against the readable projects only. */
    private readTarget;
    private context;
    ready(agent: Agent): Promise<AgentState>;
    refreshAll(): Promise<string[]>;
    requireAgent(agent?: Agent): Promise<{
        agent: Agent;
        state: AgentState;
    }>;
    install(): void;
    private tools;
    /** Grants are read-only: no tool may target another project for writing. */
    private assertLocalScope;
}
export {};
