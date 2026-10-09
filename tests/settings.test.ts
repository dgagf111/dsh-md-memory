import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Config } from '../src/config.js';
import { DEFAULT_SOURCES } from '../src/access.js';
import { LEGACY_SETTINGS, loadSettings, loadSettingsWithMigration, saveSettings, settingsSnapshot, stripLegacy } from '../src/settings.js';
import { markdown } from '../src/codec.js';

let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'md-memory-settings-')); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
const withSettings = (settings: object) => writeFile(join(root, 'SETTINGS.md'), markdown({ settings }, '# Memory settings'));
const base = () => Config({ memoryDir: root });

describe('legacy settings', () => {
  it('lists exactly the removed global toggles', () => {
    expect([...LEGACY_SETTINGS]).toEqual(['recallUser']);
  });

  it('drops legacy keys while keeping every current value', () => {
    expect(stripLegacy({ recallUser: false, bodyBytes: 4096, crossProject: {} })).toEqual({ bodyBytes: 4096, crossProject: {} });
  });

  it('keeps the legacy key in the raw snapshot so the loader can migrate it', async () => {
    await withSettings({ recallUser: true, bodyBytes: 2048 });
    const saved = await settingsSnapshot(root);
    expect((saved.values as Record<string, unknown>).recallUser).toBe(true);
  });
});

describe('loadSettingsWithMigration', () => {
  it('loads a legacy file without the removed field and seeds the user scope from it', async () => {
    await withSettings({ recallUser: true, bodyBytes: 2048 });
    const { config, legacySources } = await loadSettingsWithMigration(base());
    expect('recallUser' in config).toBe(false);
    expect(config.bodyBytes).toBe(2048);
    expect(legacySources).toEqual([...DEFAULT_SOURCES]);
  });

  it('does not revive the user scope for installs that had switched it off', async () => {
    await withSettings({ recallUser: false });
    const { config, legacySources } = await loadSettingsWithMigration(base());
    expect('recallUser' in config).toBe(false);
    expect(legacySources).toEqual([]);
    expect(config.crossProject).toEqual({});
  });

  it('defaults to the user scope when no file exists and keeps loadSettings working', async () => {
    expect((await loadSettingsWithMigration(base())).legacySources).toEqual([...DEFAULT_SOURCES]);
    expect((await loadSettings(base())).indexBytes).toBe(1024);
  });
});

describe('saveSettings', () => {
  it('accepts an old page that still sends recallUser and writes a clean file', async () => {
    const { memoryDir: _directory, ...values } = base();
    const saved = await saveSettings(root, base(), { ...values, recallUser: true, crossProject: { 'alpha-aaaaaaaaaaaaaaaa': ['user'] } }, '');
    expect('recallUser' in saved).toBe(false);
    expect(saved.crossProject).toEqual({ 'alpha-aaaaaaaaaaaaaaaa': ['user'] });
    const content = await readFile(join(root, 'SETTINGS.md'), 'utf8');
    expect(content).not.toContain('recallUser');
    expect(content).toContain('crossProject');
    expect((await settingsSnapshot(root)).values.crossProject).toEqual({ 'alpha-aaaaaaaaaaaaaaaa': ['user'] });
  });

  it('rejects an unknown setting and a stale hash', async () => {
    const { memoryDir: _directory, ...values } = base();
    await expect(saveSettings(root, base(), { ...values, nonsense: 1 }, '')).rejects.toMatchObject({ code: 'INVALID_SETTINGS' });
    await expect(saveSettings(root, base(), { ...values, bodyLimit: 9 }, 'deadbeef')).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
  });

  it('rejects a malformed cross-project matrix before touching the file', async () => {
    const { memoryDir: _directory, ...values } = base();
    await expect(saveSettings(root, base(), { ...values, crossProject: { 'alpha-aaaaaaaaaaaaaaaa': 'user' } }, '')).rejects.toMatchObject({ code: 'INVALID_SETTINGS' });
  });
});
