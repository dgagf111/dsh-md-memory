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
 */
export declare const LEGACY_SETTINGS: readonly ["recallUser"];
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
