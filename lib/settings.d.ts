import { type PluginConfig } from './config.js';
/**
 * Settings keys that used to exist and must keep loading. schemastery preserves
 * unknown keys, so a stale key left in SETTINGS.md would be echoed back to the
 * page and then rejected by the save whitelist. Strip it on read and on write.
 *
 * `recallUser` was replaced by the per-project `crossProject` grants: a project
 * absent from the matrix now defaults to `DEFAULT_SOURCES`. A legacy
 * `recallUser: false` is honoured once as that default, so user memory does not
 * silently come back for installs that had switched it off.
 *
 * The background-extraction keys were removed in 0.7.0 together with the
 * feature: memory is now only written by an explicit `md_memory_write` /
 * `md_memory_forget` call or from the memory page. An install that still has
 * those keys in SETTINGS.md keeps loading, and the first save drops them.
 */
export declare const LEGACY_SETTINGS: readonly ["recallUser", "autoExtract", "extractionProvider", "extractionModel", "extractionTimeoutMs", "extractionMaxTokens", "extractionMaxOperations", "extractionAttempts", "enableInHeadless"];
export declare function stripLegacy(values: Record<string, unknown>): Record<string, unknown>;
export declare function settingsSnapshot(root: string): Promise<{
    values: Partial<PluginConfig>;
    hash: string;
}>;
export declare function loadSettingsWithMigration(base: PluginConfig): Promise<{
    config: PluginConfig;
    legacySources: string[];
}>;
export declare function loadSettings(base: PluginConfig): Promise<PluginConfig>;
export declare function saveSettings(root: string, base: PluginConfig, values: unknown, expectedHash: string, apply?: (config: PluginConfig) => void): Promise<PluginConfig>;
