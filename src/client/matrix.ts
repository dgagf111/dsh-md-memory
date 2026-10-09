import type { Group } from '../management.js';
import type { SettingsValues } from './api.js';

/**
 * Writes one explicit source list per known project before saving.
 *
 * The page renders a default for projects the matrix does not mention, so the
 * saved file must materialise them: otherwise the one-time migration default
 * (from the removed global `recallUser` toggle) would keep deciding for those
 * projects instead of the checkboxes the user is looking at.
 *
 * With no projects loaded the current matrix is returned untouched, so a failed
 * project listing can never wipe existing grants.
 */
export function matrixPayload(values: SettingsValues, projects: Group[]): Record<string, string[]> {
  const current = values.crossProject ?? {};
  if (projects.length === 0) return current;
  return Object.fromEntries(projects.map(project => [project.id, [...(current[project.id] ?? ['user'])] ]));
}

/**
 * Whether the running host understands cross-project grants.
 *
 * The packaged client bundle is re-fetched from disk as soon as the package is
 * replaced, while host code only loads at process start. Between those two
 * moments the page would look fine but every save would fail with
 * `Unknown setting: crossProject`, so the page queries the capability from the
 * settings payload instead of assuming it.
 */
export function grantsSupported(values: SettingsValues): boolean {
  return Object.hasOwn(values, 'crossProject');
}

/** Body sent to the host: grants only travel when the host can accept them. */
export function settingsPayload(values: SettingsValues, projects: Group[]): SettingsValues {
  return grantsSupported(values) ? { ...values, crossProject: matrixPayload(values, projects) } : values;
}
