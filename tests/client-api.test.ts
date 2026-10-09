import { afterEach, expect, it, vi } from 'vitest';
import { api, ApiError } from '../src/client/api.js';
afterEach(() => vi.unstubAllGlobals());
it('reports a missing host route with status and endpoint instead of a JSON parser error', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));
  await expect(api.settings()).rejects.toMatchObject({ code: 'HTTP_404', message: '记忆接口 settings 请求失败（HTTP 404）：not found' });
});
it('preserves structured host errors such as an edit conflict', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ code: 'REVISION_CONFLICT', message: '记忆已被更新。' }, { status: 409 })));
  await expect(api.groups()).rejects.toMatchObject({ code: 'REVISION_CONFLICT', message: '记忆已被更新。' });
});
it('exposes a malformed successful response as a protocol error', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('bad response', { headers: { 'content-type': 'application/json' } })));
  await expect(api.groups()).rejects.toBeInstanceOf(SyntaxError);
});
