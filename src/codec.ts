import { createHash } from 'node:crypto';
import { parseDocument, stringify } from 'yaml';
import type { Memory, MemoryScope, MemorySource, WriteInput } from './types.js';
import { MemoryError } from './types.js';

export const digest = (text: string): string => createHash('sha256').update(text).digest('hex');
const reserved = /^(memory|state|project|con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;
export function validateName(name: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64 || reserved.test(name)) {
    throw new MemoryError('INVALID_NAME', `Use a non-reserved lowercase kebab-case name (max 64): ${name}`);
  }
  return name;
}
export function parseFrontmatter(content: string): { metadata: Record<string, unknown>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  if (!match) throw new MemoryError('INVALID_MARKDOWN', 'Memory/state file must begin with YAML frontmatter.');
  const document = parseDocument(match[1]!, { uniqueKeys: true });
  if (document.errors.length) throw new MemoryError('INVALID_METADATA', document.errors.map(e => e.message).join('; '));
  const metadata = document.toJSON() as unknown;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new MemoryError('INVALID_METADATA', 'Frontmatter must be a mapping.');
  return { metadata: metadata as Record<string, unknown>, body: content.slice(match[0].length).trim() };
}
export function markdown(metadata: object, body = ''): string { return `---\n${stringify(metadata).trimEnd()}\n---\n\n${body.trim()}\n`; }
export function containsSecret(text: string): boolean {
  return /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:sk-[a-zA-Z0-9_-]{20,}|gh[pousr]_[a-zA-Z0-9]{20,})|(?:api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*["']?[a-zA-Z0-9+/=_-]{12,}/i.test(text);
}
export function redact(text: string): string {
  return text.replace(/\b(?:sk-[a-zA-Z0-9_-]{20,}|gh[pousr]_[a-zA-Z0-9]{20,})/g, '[REDACTED]')
    .replace(/((?:api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*)["']?[a-zA-Z0-9+/=_-]{12,}["']?/gi, '$1[REDACTED]');
}
function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new MemoryError('INVALID_METADATA', `${field} must be a nonempty string.`);
  return value;
}
function strings(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some(v => typeof v !== 'string')) throw new MemoryError('INVALID_METADATA', `${field} must be a string array.`);
  return value as string[];
}
export function decodeMemory(content: string, scope: MemoryScope, name: string, filePath: string, sourceKey = scope === 'user' ? 'user' : 'project'): Memory {
  const { metadata: m, body } = parseFrontmatter(content);
  const nested = m.metadata as Record<string, unknown> | undefined;
  const type = m.type ?? nested?.type;
  if (!['user', 'feedback', 'project', 'reference'].includes(String(type))) throw new MemoryError('INVALID_METADATA', 'Unknown memory type.');
  const revision = m.revision ?? 1;
  if (!Number.isInteger(revision) || Number(revision) < 1) throw new MemoryError('INVALID_METADATA', 'revision must be a positive integer.');
  const source = (m.source ?? { session: 'external', turn: 0, kind: 'import' }) as MemorySource;
  if (typeof source.session !== 'string' || !Number.isInteger(source.turn) || !['explicit-user', 'agent', 'extraction', 'import'].includes(source.kind)) throw new MemoryError('INVALID_METADATA', 'Invalid memory source.');
  const created = m.created ?? new Date(0).toISOString();
  const modified = m.modified ?? created;
  if (typeof created !== 'string' || typeof modified !== 'string' || !Number.isFinite(Date.parse(created)) || !Number.isFinite(Date.parse(modified))) throw new MemoryError('INVALID_METADATA', 'created/modified must be timestamps.');
  if (m.status !== undefined && !['active', 'disabled'].includes(String(m.status))) throw new MemoryError('INVALID_METADATA', 'Unknown memory status.');
  if (!body) throw new MemoryError('INVALID_MARKDOWN', 'Memory body cannot be empty.');
  if (containsSecret(content)) throw new MemoryError('SENSITIVE_CONTENT', `Potential credential in ${filePath}; remove it before using memory.`);
  return { id: String(m.id ?? `${scope}:${name}`), name: validateName(name), title: text(m.title ?? m.name, 'title'), description: text(m.description, 'description'),
    type: type as Memory['type'], scope, body, tags: strings(m.tags, 'tags'), aliases: strings(m.aliases, 'aliases'), paths: strings(m.paths, 'paths'),
    created, modified, revision: Number(revision), pinned: m.pinned === true, status: m.status === 'disabled' ? 'disabled' : 'active', source, filePath, hash: digest(content), sourceKey,
    ...(typeof m.operationId === 'string' ? { operationId: m.operationId } : {}) };
}
export function encodeMemory(memory: Omit<Memory, 'hash' | 'filePath'>): string {
  const { body, scope: _scope, sourceKey: _source, ...metadata } = memory;
  return markdown(metadata, body);
}
export function validateWrite(input: WriteInput): void {
  validateName(input.name);
  for (const [field, limit] of [['title', 160], ['description', 500], ['body', 32000]] as const) {
    if (typeof input[field] !== 'string' || !input[field].trim() || input[field].length > limit) throw new MemoryError('INVALID_INPUT', `${field} must be nonempty and at most ${limit} characters.`);
  }
  if (!['user', 'feedback', 'project', 'reference'].includes(input.type) || !['user', 'project'].includes(input.scope)) throw new MemoryError('INVALID_INPUT', 'Invalid type or scope.');
  for (const field of ['tags', 'aliases', 'paths'] as const) strings(input[field], field);
  if (!input.source || typeof input.source.session !== 'string' || !Number.isInteger(input.source.turn) || !['explicit-user', 'agent', 'extraction', 'import'].includes(input.source.kind)) throw new MemoryError('INVALID_INPUT', 'Invalid write provenance.');
  if (input.operationId !== undefined && !/^[a-zA-Z0-9-]{1,128}$/.test(input.operationId)) throw new MemoryError('INVALID_INPUT', 'Invalid operation id.');
  if (input.status !== undefined && !['active', 'disabled'].includes(input.status)) throw new MemoryError('INVALID_INPUT', 'Invalid memory status.');
  if (input.pinned !== undefined && typeof input.pinned !== 'boolean') throw new MemoryError('INVALID_INPUT', 'pinned must be a boolean.');
  if (containsSecret([input.title, input.description, input.body, ...(input.tags ?? []), ...(input.aliases ?? [])].join('\n'))) throw new MemoryError('SENSITIVE_CONTENT', 'Potential credential detected. Remove it; nothing was written.');
}
