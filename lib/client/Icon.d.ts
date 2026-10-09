declare const paths: {
    memory: import("react").JSX.Element;
    user: import("react").JSX.Element;
    folder: import("react").JSX.Element;
    search: import("react").JSX.Element;
    plus: import("react").JSX.Element;
    refresh: import("react").JSX.Element;
    settings: import("react").JSX.Element;
    arrow: import("react").JSX.Element;
    down: import("react").JSX.Element;
    right: import("react").JSX.Element;
    trash: import("react").JSX.Element;
    move: import("react").JSX.Element;
    check: import("react").JSX.Element;
};
export declare function Icon({ name, size }: {
    name?: keyof typeof paths;
    size?: number;
}): import("react").JSX.Element;
export {};
