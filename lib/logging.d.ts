import type { Logger } from './types.js';
export declare function createLogger(root: string, debug?: boolean | (() => boolean), sink?: (level: string, text: string) => void): Logger;
