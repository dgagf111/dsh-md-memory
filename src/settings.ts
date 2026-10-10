import { join } from 'node:path';
import { Config, memoryRoot, type PluginConfig } from './config.js';
import { DEFAULT_SOURCES } from './access.js';
import { markdown, parseFrontmatter, digest } from './codec.js';
import { atomicMarkdown, isMissing, readMarkdown, withDirectoryLock } from './files.js';
import { MemoryError } from './types.js';

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
export const LEGACY_SETTINGS = ['recallUser', 'autoExtract', 'extractionProvider', 'extractionModel', 'extractionTimeoutMs',
  'extractionMaxTokens', 'extractionMaxOperations', 'extractionAttempts', 'enableInHeadless'] as const;

export function stripLegacy(values: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if ((LEGACY_SETTINGS as readonly string[]).includes(key)) continue;
    clean[key] = value;
  }
  return clean;
}

function legacySources(values: Record<string, unknown>): string[] {
  return values.recallUser === false ? [] : [...DEFAULT_SOURCES];
}

export async function settingsSnapshot(root: string): Promise<{ values: Partial<PluginConfig>; hash: string }> {
  let content: string;
  try { content = await readMarkdown(join(root, 'SETTINGS.md')); }
  catch (error) { if (isMissing(error)) return { values: {}, hash: '' }; throw error; }
  const values = parseFrontmatter(content).metadata.settings;
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new MemoryError('INVALID_SETTINGS', 'SETTINGS.md must contain a settings object.');
  return { values: values as Partial<PluginConfig>, hash: digest(content) };
}

export async function loadSettingsWithMigration(base: PluginConfig): Promise<{ config: PluginConfig; legacySources: string[] }> {
  const saved = await settingsSnapshot(memoryRoot(base));
  if ('memoryDir' in saved.values) throw new MemoryError('INVALID_SETTINGS', 'Memory directory is configured by the DSH profile, not SETTINGS.md.');
  const raw = saved.values as Record<string, unknown>;
  return { config: Config({ ...base, ...stripLegacy(raw) }), legacySources: legacySources(raw) };
}

export async function loadSettings(base: PluginConfig): Promise<PluginConfig> {
  return (await loadSettingsWithMigration(base)).config;
}

export async function saveSettings(root: string, base: PluginConfig, values: unknown, expectedHash: string, apply?: (config: PluginConfig) => void): Promise<PluginConfig> {
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new MemoryError('INVALID_SETTINGS', 'Settings must be an object.');
  if ('memoryDir' in values) throw new MemoryError('INVALID_SETTINGS', 'Storage directory cannot be changed from the page.');
  const input = stripLegacy(values as Record<string, unknown>);
  const allowed = new Set(Object.keys(Config({})).filter(key => key !== 'memoryDir'));
  for (const key of Object.keys(input)) if (!allowed.has(key)) throw new MemoryError('INVALID_SETTINGS', `Unknown setting: ${key}`);
  let config: PluginConfig;
  try { config = Config({ ...base, ...input }); }
  catch (error) { throw new MemoryError('INVALID_SETTINGS', error instanceof Error ? error.message : String(error), { cause: error }); }
  await withDirectoryLock(join(root, 'settings'), async () => {
    if ((await settingsSnapshot(root)).hash !== expectedHash) throw new MemoryError('REVISION_CONFLICT', 'Settings changed in another window. Reload before saving.');
    const { memoryDir: _directory, ...settings } = config;
    await atomicMarkdown(join(root, 'SETTINGS.md'), markdown({ settings }, '# Memory settings\nSaved from the DSH memory page. Overrides profile defaults except the storage directory.'));
    apply?.(config);
  });
  return config;
}
