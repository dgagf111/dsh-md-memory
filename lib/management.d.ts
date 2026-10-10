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
            autoExtract: boolean;
            extractionProvider: string;
            extractionModel: string;
            extractionTimeoutMs: number;
            extractionMaxTokens: number;
            extractionMaxOperations: number;
            extractionAttempts: number;
            enableInHeadless: boolean;
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
            autoExtract: boolean;
            extractionProvider: string;
            extractionModel: string;
            extractionTimeoutMs: number;
            extractionMaxTokens: number;
            extractionMaxOperations: number;
            extractionAttempts: number;
            enableInHeadless: boolean;
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
     * deletion. Entries queued for background extraction in that project are
     * dropped first, so work scheduled before the reset cannot write it back.
     */
    reset(data: unknown): Promise<{
        removed: number;
        cancelledExtractions: number;
        warnings: string[];
    }>;
}
export declare function registerManagement(ctx: Context, runtime: MemoryRuntime): void;
