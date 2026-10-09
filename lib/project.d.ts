import { type ProjectIdentity } from './types.js';
export declare function resolveProject(cwd: string, signal?: AbortSignal): Promise<ProjectIdentity>;
