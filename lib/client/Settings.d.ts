import type { Group } from '../management.js';
import type { SettingsValues, SettingsView } from './api.js';
interface Props {
    view: SettingsView;
    values: SettingsValues;
    setValues: (values: SettingsValues) => void;
    save: () => void;
    reset: () => void;
    busy: boolean;
    dirty: boolean;
    projects: Group[];
    grantsSupported: boolean;
}
export declare function Settings({ view, values, setValues, save, reset, busy, dirty, projects, grantsSupported }: Props): import("react").JSX.Element;
export {};
