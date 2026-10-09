export declare function isMissing(error: unknown): boolean;
export declare function assertRegularDirectory(path: string): Promise<void>;
export declare function ensureDirectory(path: string): Promise<void>;
export declare function readMarkdown(path: string, limit?: number): Promise<string>;
export declare function atomicMarkdown(path: string, content: string): Promise<void>;
export declare function withDirectoryLock<T>(directory: string, run: () => Promise<T>, signal?: AbortSignal): Promise<T>;
