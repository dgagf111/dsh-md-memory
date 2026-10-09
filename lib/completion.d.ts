import type { Context } from '@deepseek-ai/cordis';
import type { PluginConfig } from './config.js';
import type { Completion } from './extraction.js';
export declare function createCompletion(ctx: Context, config: PluginConfig): Completion;
