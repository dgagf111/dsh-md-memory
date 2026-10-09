import { describe, expect, it } from 'vitest';
import type { Group } from '../src/management.js';
import { grantsSupported, matrixPayload, settingsPayload } from '../src/client/matrix.js';
import type { SettingsValues } from '../src/client/api.js';

const group = (id: string, label = id): Group => ({ id, scope: 'project', label, entries: [], diagnostics: [] });
const values = (crossProject: Record<string, string[]>): SettingsValues => ({ crossProject } as unknown as SettingsValues);
const legacyValues = (extra: Record<string, unknown> = {}): SettingsValues => ({ indexBytes: 1024, recallUser: true, ...extra } as unknown as SettingsValues);

describe('matrixPayload', () => {
  it('materialises every known project, defaulting to the user scope', () => {
    expect(matrixPayload(values({}), [group('alpha-1'), group('beta-2')])).toEqual({ 'alpha-1': ['user'], 'beta-2': ['user'] });
  });

  it('keeps explicit choices, including an empty one, and fills the rest', () => {
    const saved = matrixPayload(values({ 'alpha-1': ['beta-2'], 'beta-2': [] }), [group('alpha-1'), group('beta-2'), group('gamma-3')]);
    expect(saved).toEqual({ 'alpha-1': ['beta-2'], 'beta-2': [], 'gamma-3': ['user'] });
  });

  it('preserves unlisted project grants for the server to distinguish broken metadata from missing projects', () => {
    expect(matrixPayload(values({ 'gone-9': [] }), [group('alpha-1')])).toEqual({ 'gone-9': [], 'alpha-1': ['user'] });
  });

  it('never wipes the matrix when the project list failed to load', () => {
    const current = { 'alpha-1': ['beta-2'] };
    expect(matrixPayload(values(current), [])).toBe(current);
  });

  it('does not mutate the values it was given', () => {
    const source = values({ 'alpha-1': ['user'] });
    const saved = matrixPayload(source, [group('alpha-1'), group('beta-2')]);
    saved['alpha-1']!.push('beta-2');
    expect(source.crossProject).toEqual({ 'alpha-1': ['user'] });
  });
});

describe('host capability', () => {
  it('reads the grant capability from the settings payload the host returned', () => {
    expect(grantsSupported(values({}))).toBe(true);
    expect(grantsSupported(legacyValues())).toBe(false);
  });

  it('never sends grants to a host that predates them', () => {
    const legacy = legacyValues();
    const payload = settingsPayload(legacy, [group('alpha-1'), group('beta-2')]);
    expect('crossProject' in payload).toBe(false);
    expect(payload).toBe(legacy);
    // The rest of the settings must still be submittable in that window.
    expect(payload.indexBytes).toBe(1024);
  });

  it('materialises the matrix when the host understands grants', () => {
    expect(settingsPayload(values({}), [group('alpha-1')])).toEqual({ crossProject: { 'alpha-1': ['user'] } });
  });
});
