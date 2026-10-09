import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ensureDirectory } from './files.js';
import { redact } from './codec.js';
import type { Logger, LogRecord } from './types.js';

function errorDetails(error: unknown): unknown {
  if (!(error instanceof Error)) return redact(String(error));
  return { name: error.name, message: redact(error.message), stack: error.stack ? redact(error.stack) : undefined,
    code: (error as NodeJS.ErrnoException).code,
    ...(error.cause !== undefined ? { cause: errorDetails(error.cause) } : {}) };
}

export function createLogger(root: string, debug: boolean | (() => boolean) = false, sink: (level: string, text: string) => void = () => {}): Logger {
  let queue = Promise.resolve();
  let failure: unknown;
  function write(level: string, record: LogRecord, error?: unknown): void {
    if (level === 'debug' && !(typeof debug === 'function' ? debug() : debug)) return;
    const data = { time: new Date().toISOString(), level, pid: process.pid, ...record,
      ...(error === undefined ? {} : { error: errorDetails(error) }) };
    // No transcripts, model output, or memory bodies: callers log ids and bounded operational facts.
    const line = redact(JSON.stringify(data));
    sink(level, line);
    queue = queue.then(async () => {
      const directory = join(root, 'logs');
      await ensureDirectory(directory);
      const file = join(directory, `${data.time.slice(0, 10)}-${process.pid}.md`);
      await appendFile(file, `\n\`\`\`json\n${line}\n\`\`\`\n`, { mode: 0o600 });
    }).catch(error => { failure = error; sink('error', `Memory log write failed: ${String(error)}`); });
  }
  return { debug: r => write('debug', r), info: r => write('info', r), error: (r, e) => write('error', r, e),
    async flush() { await queue; if (failure) throw failure; } };
}
