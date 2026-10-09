import type { Context } from '@deepseek-ai/cordis';
import { Config, type PluginConfig } from './config.js';
import { MemoryRuntime } from './runtime.js';
import { loadSettingsWithMigration } from './settings.js';
import { registerManagement } from './management.js';
export { Config };
export type { PluginConfig };
export { MemoryRuntime };
export const name = 'md-memory';
export const inject = ['tools', 'systemPrompt', 'agents', 'sessions'];
declare module '@deepseek-ai/cordis' { interface Context { mdMemory: MemoryRuntime; } }
export async function apply(ctx: Context, config: PluginConfig): Promise<void> {
  const { config: loaded, legacySources } = await loadSettingsWithMigration(config);
  const runtime = new MemoryRuntime(ctx, loaded, config, legacySources);
  ctx.provide('mdMemory', runtime);
  runtime.install();
  ctx.inject(['connection'], child => {
    try { registerManagement(child, runtime); }
    catch (error) { runtime.logger.error({ event: 'management.registration_failed' }, error); throw error; }
  });
}
