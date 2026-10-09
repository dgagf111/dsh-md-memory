import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-layout/client';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client';
import type {} from '@deepseek-ai/dsh-client-locale/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import { MemoryPage } from './MemoryPage.js';
import { Icon } from './Icon.js';
import { api } from './api.js';
export const inject = ['slots', 'locale'];
declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { mdMemory: 'panel'; } }
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('mdMemory', { zh: { panel: '记忆' }, en: { panel: 'Memory' } }), 'md-memory: locale');
  const t = ctx.locale.bind('mdMemory');
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'md-memory', inject: () => ({ api }) }, MemoryPage));
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'md-memory', order: 50, label: () => t('panel'), locale: 'mdMemory' }, Icon));
}
