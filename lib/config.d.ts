import Schema from '@deepseek-ai/schemastery';
export interface PluginConfig {
    memoryDir: string;
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
    /** Per-project read grants: own project id -> the memory blocks its sessions may see (`user` and/or project ids). */
    crossProject: Record<string, string[]>;
}
export declare const Config: Schema<Partial<PluginConfig>, PluginConfig>;
export declare function memoryRoot(config: PluginConfig): string;
