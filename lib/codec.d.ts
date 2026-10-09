import type { Memory, MemoryScope, WriteInput } from './types.js';
export declare const digest: (text: string) => string;
export declare function validateName(name: string): string;
export declare function parseFrontmatter(content: string): {
    metadata: Record<string, unknown>;
    body: string;
};
export declare function markdown(metadata: object, body?: string): string;
export declare function containsSecret(text: string): boolean;
export declare function redact(text: string): string;
export declare function decodeMemory(content: string, scope: MemoryScope, name: string, filePath: string, sourceKey?: string): Memory;
export declare function encodeMemory(memory: Omit<Memory, 'hash' | 'filePath'>): string;
export declare function validateWrite(input: WriteInput): void;
