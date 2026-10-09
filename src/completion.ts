import type { Context } from '@deepseek-ai/cordis';
import type { PluginConfig } from './config.js';
import type { Completion } from './extraction.js';
import { MemoryError } from './types.js';

export function createCompletion(ctx: Context, config: PluginConfig): Completion {
  return async (task, system, input, parentSignal) => {
    const signal = AbortSignal.any([parentSignal, AbortSignal.timeout(config.extractionTimeoutMs)]);
    const llm = ctx.get('llm');
    if (!llm) throw new MemoryError('NO_LLM_SERVICE', 'Background extraction requires the DSH llm service.');
    const prepared = await llm.prepareCall({ provider: task.provider!, model: task.model!, maxTokens: config.extractionMaxTokens }, signal);
    let text = '';
    let finished = false;
    for await (const chunk of prepared.stream({ ...prepared.config, system, messages: [{ role: 'user', content: [{ type: 'text', text: input }] }], signal })) {
      signal.throwIfAborted();
      if (chunk.type === 'text-delta') text += chunk.text;
      if (Buffer.byteLength(text) > 128 * 1024) throw new MemoryError('EXTRACTION_OUTPUT_TOO_LARGE', 'Extraction output exceeded 128 KiB.');
      if (chunk.type === 'finish') {
        if (chunk.reason.kind !== 'stop') throw new MemoryError('EXTRACTION_FINISH', `Extraction did not finish successfully: ${chunk.reason.kind}`);
        finished = true;
      }
    }
    if (!finished || !text.trim()) throw new MemoryError('EMPTY_EXTRACTION', 'Extraction stream ended without successful text.');
    return text;
  };
}
