import { type ReactNode } from 'react';
declare const DEFAULT: {
    project: number;
    memory: number;
};
/** Keep the editor at least 320px wide; narrow layouts are arranged by CSS. */
export declare function fitPaneWidths(width: number, requested: typeof DEFAULT, editor: boolean): {
    project: number;
    memory: number;
};
interface Props {
    navigation: ReactNode;
    library: ReactNode;
    editor?: ReactNode;
}
export declare function PaneLayout({ navigation, library, editor }: Props): import("react").JSX.Element;
export {};
