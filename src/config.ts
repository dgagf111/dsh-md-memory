import Schema from '@deepseek-ai/schemastery';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
export interface PluginConfig {
  memoryDir: string; indexBytes: number; bodyBytes: number; autoRecall: boolean; debug: boolean;
  indexEnabled: boolean; recallProject: boolean; bodyLimit: number;
  /** Per-project read grants: own project id -> the memory blocks its sessions may see (`user` and/or project ids). */
  crossProject: Record<string, string[]>;
}
export const Config: Schema<Partial<PluginConfig>, PluginConfig> = Schema.object({
  memoryDir: Schema.string().default('').description('Markdown root; defaults to $DSH_HOME/md-memory.'),
  indexBytes: Schema.natural().min(512).max(65536).default(1024).description('Entire index context UTF-8 budget.'),
  bodyBytes: Schema.natural().min(256).max(65536).default(12288).description('On-demand body context UTF-8 budget.'),
  autoRecall: Schema.boolean().default(true).description('Recall related bodies on new input; index is always available.'),
  indexEnabled: Schema.boolean().default(true).description('Inject the short memory index.'),
  recallProject: Schema.boolean().default(true).description('Include the current project memories in retrieval.'),
  crossProject: Schema.dict(Schema.array(Schema.string())).default({}).description('Per-project read grants for other projects and the user scope.'),
  bodyLimit: Schema.natural().min(1).max(20).default(5),
  debug: Schema.boolean().default(true).description('Record retrieval scores and decisions; never log raw bodies.'),
});
export function memoryRoot(config: PluginConfig): string {
  return config.memoryDir ? resolve(config.memoryDir) : join(process.env.DSH_HOME ? resolve(process.env.DSH_HOME) : join(homedir(), '.dsh'), 'md-memory');
}
