import type { Context } from '@deepseek-ai/cordis';
import { Config, type PluginConfig } from './config.js';
import { MemoryRuntime } from './runtime.js';
export { Config };
export type { PluginConfig };
export { MemoryRuntime };
export declare const name = "md-memory";
export declare const inject: string[];
declare module '@deepseek-ai/cordis' {
    interface Context {
        mdMemory: MemoryRuntime;
    }
}
export declare function apply(ctx: Context, config: PluginConfig): Promise<void>;
