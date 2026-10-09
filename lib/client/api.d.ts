import type { Group } from '../management.js';
import type { Memory, WriteInput } from '../types.js';
import type { PluginConfig } from '../config.js';
export type SettingsValues = Omit<PluginConfig, 'memoryDir'>;
export interface SettingsView {
    values: SettingsValues;
    hash: string;
    root: string;
    warnings?: string[];
    stale?: string[];
}
export interface Target {
    scope: 'user' | 'project';
    projectId?: string;
}
export declare class ApiError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
export declare const api: {
    groups: (signal?: AbortSignal) => Promise<Group[]>;
    read: (target: Target, name: string, signal?: AbortSignal) => Promise<Memory>;
    write: (data: WriteInput & {
        projectId?: string;
    }) => Promise<{
        memory: Memory;
        warnings: string[];
    }>;
    forget: (target: Target, memory: Memory) => Promise<{
        warnings: string[];
    }>;
    move: (from: Target, to: Target, memory: Memory) => Promise<{
        memory: Memory;
        warnings: string[];
    }>;
    settings: (signal?: AbortSignal) => Promise<SettingsView>;
    saveSettings: (values: SettingsValues, hash: string) => Promise<SettingsView>;
};
export type MemoryApi = typeof api;
