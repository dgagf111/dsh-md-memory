import type { Context } from '@deepseek-ai/cordis';
import { type Memory, type ProjectIdentity, type MemoryScope, type WriteInput } from './types.js';
import type { MemoryRuntime } from './runtime.js';
export interface Group {
    id: string;
    scope: MemoryScope;
    label: string;
    project?: ProjectIdentity;
    entries: Omit<Memory, 'body'>[];
    diagnostics: {
        code: string;
        path: string;
        message: string;
    }[];
}
export declare class MemoryManagement {
    readonly runtime: MemoryRuntime;
    constructor(runtime: MemoryRuntime);
    project(id: string): Promise<ProjectIdentity>;
    groups(): Promise<Group[]>;
    target(scope: unknown, projectId?: unknown): Promise<{
        scope: MemoryScope;
        project?: ProjectIdentity;
    }>;
    settings(): Promise<{
        values: {
            indexBytes: number;
            bodyBytes: number;
            autoRecall: boolean;
            debug: boolean;
            indexEnabled: boolean;
            recallProject: boolean;
            bodyLimit: number;
            crossProject: Record<string, string[]>;
        };
        hash: string;
        root: string;
        warnings: string[];
    }>;
    private applyConfig;
    updateSettings(values: unknown, hash: string): Promise<{
        warnings: string[];
        stale: string[];
        values: {
            indexBytes: number;
            bodyBytes: number;
            autoRecall: boolean;
            debug: boolean;
            indexEnabled: boolean;
            recallProject: boolean;
            bodyLimit: number;
            crossProject: Record<string, string[]>;
        };
        hash: string;
        root: string;
    }>;
    write(data: WriteInput & {
        projectId?: string;
    }): Promise<{
        memory: Memory;
        warnings: string[];
    }>;
    forget(data: {
        scope: string;
        projectId?: string;
        name: string;
        revision: number;
        hash: string;
    }): Promise<{
        warnings: string[];
    }>;
    move(data: {
        scope?: unknown;
        projectId?: unknown;
        toScope?: unknown;
        toProjectId?: unknown;
        name?: unknown;
        revision?: unknown;
        hash?: unknown;
    }): Promise<{
        memory: Memory;
        warnings: string[];
    }>;
    /**
     * Erases one project's whole memory after the page confirmed it. The user scope
     * is never a target: it is shared across projects, so it keeps per-entry
     * deletion. Nothing writes memory in the background any more, so the wipe is
     * final until someone explicitly writes or the page saves again.
     */
    reset(data: unknown): Promise<{
        removed: number;
        warnings: string[];
    }>;
    /**
     * Removes one whole project from the memory library after the page confirmed
     * it: its directory, `PROJECT.md` and empty index are deleted, so `groups()`
     * stops listing it. The host refuses any project that still holds entries —
     * the page must clear it first — and the user scope is shared, so it keeps
     * per-entry deletion. A later session in that workspace writes a fresh,
     * empty project through `MemoryStore.ensureIdentity`.
     */
    removeProject(data: unknown): Promise<{
        warnings: string[];
    }>;
}
export declare function registerManagement(ctx: Context, runtime: MemoryRuntime): void;
