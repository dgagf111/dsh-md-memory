import type { Group } from '../management.js';
import type { Memory, WriteInput } from '../types.js';
import type { PluginConfig } from '../config.js';
export type SettingsValues = Omit<PluginConfig, 'memoryDir'>;
export interface SettingsView { values: SettingsValues; hash: string; root: string; warnings?: string[]; stale?: string[]; }
export interface Target { scope: 'user' | 'project'; projectId?: string; }
export class ApiError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}
async function request<T>(path: string, data?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/md-memory/${path}`, { credentials: 'same-origin', cache: 'no-store', signal,
    ...(data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }) });
  const isJson = response.headers.get('content-type')?.includes('application/json');
  if (!response.ok && !isJson) {
    const detail = (await response.text()).trim().slice(0, 200);
    throw new ApiError(`HTTP_${response.status}`, `记忆接口 ${path.split('?')[0]} 请求失败（HTTP ${response.status}）${detail ? `：${detail}` : '。'}`);
  }
  const result = await response.json();
  if (!response.ok) throw new ApiError(result.code ?? `HTTP_${response.status}`, result.message ?? '请求失败，请重试。');
  return result as T;
}
export const api = {
  groups: (signal?: AbortSignal) => request<Group[]>('groups', undefined, signal),
  read: (target: Target, name: string, signal?: AbortSignal) => request<Memory>(`read?${new URLSearchParams({ ...target, name })}`, undefined, signal),
  write: (data: WriteInput & { projectId?: string }) => request<{ memory: Memory; warnings: string[] }>('write', data),
  forget: (target: Target, memory: Memory) => request<{ warnings: string[] }>('forget', { ...target, name: memory.name, revision: memory.revision, hash: memory.hash }),
  move: (from: Target, to: Target, memory: Memory) => request<{ memory: Memory; warnings: string[] }>('move',
    { scope: from.scope, projectId: from.projectId, toScope: to.scope, toProjectId: to.projectId, name: memory.name, revision: memory.revision, hash: memory.hash }),
  reset: (target: Target) => request<{ removed: number; warnings: string[] }>('reset', { ...target, confirm: true }),
  settings: (signal?: AbortSignal) => request<SettingsView>('settings', undefined, signal),
  saveSettings: (values: SettingsValues, hash: string) => request<SettingsView>('settings', { values, hash }),
};
export type MemoryApi = typeof api;
