import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { Context } from '@deepseek-ai/cordis';
import { HostConnectionService } from '@deepseek-ai/dsh-client-connection';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MemoryRuntime, Config } from '../lib/index.js';

// Exercise the shipped browser component against the real store + registered HTTP handlers.
const root = await mkdtemp(join(tmpdir(), 'md-memory-ui-'));
const output = 'release/ui'; await mkdir(output, { recursive: true });
const bundle = await build({ entryPoints: ['tests/ui-preview.tsx'], bundle: true, format: 'iife', platform: 'browser', write: false, loader: { '.css': 'text' } });
const ctx = new Context();
ctx.provide('agents', { list: () => [] });
const connection = new HostConnectionService(ctx, [], {});
const apiHandler = connection.createSharedFetchHandler('/api');
const runtime = new MemoryRuntime(ctx, Config({ memoryDir: root, autoExtract: false }));
// Use the registered API implementation with fixture service providers; no model call is needed.
const managementBundle = await build({ entryPoints: ['src/management.ts'], bundle: true, platform: 'node', format: 'esm', packages: 'external', write: false });
const moduleFile = join(output, 'management-fixture.mjs'); await writeFile(moduleFile, managementBundle.outputFiles[0].text);
const { registerManagement } = await import(pathToFileURL(join(process.cwd(), moduleFile)));
registerManagement(ctx, runtime);
const project = { id: 'dsh-md-memory-demo', cwd: 'E:/project/dsh-md-memory', root: 'E:/project/dsh-md-memory/.git', kind: 'git' };
await runtime.store.initializeProject(project);
const seed = async (scope, name, type, title, description, body) => runtime.store.write({ scope, name, type, title, description, body, pinned: name === 'markdown-store', source: { session: 'ui-fixture', turn: 1, kind: 'explicit-user' } }, scope === 'project' ? project : undefined);
await seed('user', 'communication', 'user', '用中文沟通，结论先行', '解释与交付用简洁中文；先说明结果，再展开依据。', '## 沟通偏好\n默认使用中文，先说结论。');
await seed('user', 'expose-errors', 'feedback', '错误应当可见', '发生故障时明确报告问题，保留详细日志便于后期维护。', '## 开发约定\n不要过度兜底；暴露问题并记录日志。');
await seed('user', 'subagent', 'reference', '子任务优先使用本机 DSH', '独立检索、审查和实现任务，优先通过本机 DSH 委派。', '## 子任务\n使用用户指定模型和高思考强度。');
await seed('project', 'markdown-store', 'reference', 'Markdown 是唯一存储格式', '记忆正文、索引、设置与日志统一使用 Markdown。', '## 持久化边界\n不使用数据库或向量存储。');
await seed('project', 'recall-index', 'project', '短索引完整注入，正文按需召回', '索引超出预算时按相关性排序，优先填充高相关条目。', '## 召回策略\n能放下时完整注入短索引。');
await seed('project', 'compatibility', 'reference', '同时适配 RC 与 Alpha', '发布前在两条版本线上验证插件接口和关键行为。', '## 宿主版本\nRC.2 与 Alpha.1 都必须验证。');
for (let i = 1; i <= 35; i++) {
  await runtime.store.initializeProject({ id: `additional-project-${i}`, cwd: `E:/project/additional-${i}`, root: `E:/project/additional-${i}`, kind: 'directory' });
  await seed('user', `additional-memory-${i}`, 'reference', `列表滚动示例 ${i}`, '用于验证记忆列表的独立滚动。', '仅在测试存储中使用。');
}
const html = `<!doctype html><html lang="zh"><meta charset="utf-8"><style>html,body,#root{height:100%;margin:0}body{font-family:system-ui,'Microsoft YaHei',sans-serif}</style><div id="root"></div><script src="/app.js"></script></html>`;
const server = createServer(async (req, res) => {
  try {
    if (req.url === '/app.js') { res.setHeader('content-type', 'text/javascript'); res.end(bundle.outputFiles[0].text); return; }
    if (req.url === '/') { res.setHeader('content-type', 'text/html'); res.end(html); return; }
    const origin = `http://127.0.0.1:${server.address().port}`;
    const url = new URL(req.url, origin);
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    if (req.method === 'POST') await new Promise(resolve => setTimeout(resolve, 350));
    const response = await apiHandler.fetch(new Request(url, { method: req.method, ...(req.method === 'GET' ? {} : { body: Buffer.concat(chunks) }) }));
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) { res.writeHead(500); res.end(String(error)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/89123/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('heading', { name: '用中文沟通，结论先行' }).waitFor();
  // The desktop sidebar leaves ~1000 CSS pixels at 125% Windows scaling.
  // This range previously retained legacy row/column placements.
  for (const width of [1050, 1000, 900, 851]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(50);
    const panes = await page.locator('.mm-workspace').evaluate(el =>
      ['.mm-library-nav', '.mm-library', '.mm-editor'].map(selector => {
        const pane = el.querySelector(selector), rect = pane.getBoundingClientRect();
        return { y: rect.y, height: rect.height, width: rect.width, overflow: pane.scrollWidth - pane.clientWidth };
      }));
    assert(panes.every(p => Math.abs(p.y - panes[0].y) < 1 && Math.abs(p.height - panes[0].height) < 1 && p.overflow <= 1), `Misaligned desktop panes at ${width}px`);
    assert(panes[2].width >= 320, `Editor collapsed at ${width}px`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const selector of ['.mm-group-list', '.mm-entry-list']) {
    const list = page.locator(selector); assert(await list.evaluate(el => el.scrollHeight > el.clientHeight), 'Long list has no independent scroll');
    const box = await list.boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + 30); await page.mouse.wheel(0, 400); await page.waitForTimeout(100);
    assert(await list.evaluate(el => el.scrollTop > 0), 'Mouse wheel did not scroll the list');
    await list.evaluate(el => { el.scrollTop = 0; });
  }
  for (const name of ['项目与记忆分界', '记忆与编辑分界']) {
    const separator = page.getByRole('separator', { name, exact: true });
    const box = await separator.boundingBox(); const before = Number(await separator.getAttribute('aria-valuenow'));
    await page.mouse.move(5, 5);
    const colors = () => separator.evaluate(el => ({ background: getComputedStyle(el).backgroundColor, grip: getComputedStyle(el.querySelector('span')).backgroundColor }));
    const normal = await colors(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); const hover = await colors();
    assert(normal.background === hover.background && normal.grip !== hover.grip, 'Separator hover changed more than the grip');
    await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 35, box.y + box.height / 2, { steps: 8 }); await page.mouse.up();
    assert(Number(await separator.getAttribute('aria-valuenow')) > before, 'Separator drag did not change width');
    await separator.focus(); await page.keyboard.press('Home');
    assert(await separator.getAttribute('aria-valuenow') === await separator.getAttribute('aria-valuemin'), 'Separator minimum not enforced');
    await page.keyboard.press('End');
    assert(await separator.getAttribute('aria-valuenow') === await separator.getAttribute('aria-valuemax'), 'Separator maximum not enforced');
    await separator.dblclick();
  }
  assert(await page.locator('.mm-editor').evaluate(el => el.clientWidth) >= 320, 'Editor was squeezed below its minimum');
  assert(await page.locator('.mm-entry').first().evaluate(el => el.clientHeight) <= 85, 'Memory cards are too tall');
  await page.screenshot({ path: join(output, 'library-light.png'), fullPage: true });
  await page.getByRole('button', { name: /dsh-md-memory.*3/ }).click();
  await page.getByRole('heading', { name: 'Markdown 是唯一存储格式' }).click();
  await page.getByLabel('标题', { exact: true }).fill('Markdown 存储约定（已编辑）');
  await page.getByLabel('正文 Markdown').fill('## 持久化边界\n正文、索引、设置、日志都使用 Markdown。');
  await page.getByText('标签与匹配线索', { exact: true }).click();
  await page.getByLabel('标签（逗号分隔）').fill('storage, markdown');
  await page.getByRole('button', { name: '保存记忆', exact: true }).click();
  assert(await page.getByLabel('标题', { exact: true }).isDisabled(), 'Editor stays writable while saving');
  await page.getByRole('status').filter({ hasText: '记忆已保存' }).waitFor();
  const saved = await runtime.store.read('project', 'markdown-store', project);
  assert(saved.title === 'Markdown 存储约定（已编辑）' && saved.revision === 2 && saved.tags.length === 2, 'UI edit did not persist');
  assert(saved.type === 'reference' && saved.pinned, 'Editing visible fields changed hidden metadata');
  assert(!await page.getByLabel('类型', { exact: true }).count() && !await page.getByLabel('置顶', { exact: true }).count(), 'Unsupported UI controls remain');
  await page.evaluate(() => { document.querySelector('.mm-page').scrollTop = 0; });
  await page.screenshot({ path: join(output, 'editor-light.png'), fullPage: true });
  await page.getByLabel('参与召回').uncheck(); await page.getByRole('button', { name: '保存记忆', exact: true }).click();
  await page.getByText('已停用', { exact: true }).waitFor();
  assert(!(await runtime.store.snapshot(project)).memories.some(m => m.name === 'markdown-store'), 'Disabled entry was still recalled');
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  assert((await runtime.store.read('project', 'markdown-store', project)).revision === 3, 'Cancel delete removed memory');
  await page.getByRole('button', { name: '删除', exact: true }).click(); await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '记忆已删除' }).waitFor();
  await page.getByRole('button', { name: '新建记忆', exact: true }).click();
  await page.getByLabel('标题', { exact: true }).fill('界面新建项目约定');
  await page.getByLabel('文件名', { exact: true }).fill('ui-created-rule');
  await page.getByLabel('短摘要', { exact: true }).fill('通过编辑页创建，验证作用域默认值。');
  await page.getByLabel('正文 Markdown').fill('新建记忆必须属于当前项目。');
  await page.getByRole('button', { name: '保存记忆', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '记忆已保存' }).waitFor();
  const created = await runtime.store.read('project', 'ui-created-rule', project);
  assert(created.type === 'project' && !created.pinned && created.revision === 1, 'New memory defaults no longer match storage logic');
  await runtime.store.write({ ...created, body: '其他操作写入的最新正文。', source: { session: 'concurrent-agent', turn: 1, kind: 'agent' }, expectedRevision: created.revision, expectedHash: created.hash, operationId: undefined }, project);
  await page.getByLabel('标题', { exact: true }).fill('冲突草稿必须保留');
  await page.getByRole('button', { name: '保存记忆', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'current revision and hash' }).waitFor();
  assert(await page.getByLabel('标题', { exact: true }).inputValue() === '冲突草稿必须保留', 'Conflict discarded the draft');
  assert((await runtime.store.read('project', created.name, project)).body === '其他操作写入的最新正文。', 'Stale edit overwrote Agent update');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: /用户记忆/ }).first().click();
  assert(await page.getByLabel('标题', { exact: true }).inputValue() === '冲突草稿必须保留', 'Scope switch discarded a dirty draft');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '配置', exact: true }).click();
  await page.getByLabel('自动召回相关正文').uncheck();
  await page.getByLabel('自动注入的短索引预算').fill('8');
  await page.getByRole('button', { name: '记忆写入', exact: true }).click();
  await page.getByLabel('请求超时').fill('30.001');
  await page.getByRole('button', { name: '维护', exact: true }).click();
  await page.getByLabel('详细日志').uncheck();
  await page.getByRole('button', { name: '召回', exact: true }).click();
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  assert(await page.getByLabel('自动注入的短索引预算').isDisabled(), 'Settings stay writable while saving');
  await page.getByRole('status').filter({ hasText: '配置已保存并生效' }).waitFor();
  assert(runtime.config.indexBytes === 8192 && !runtime.config.autoRecall, 'UI settings not applied');
  assert(runtime.config.extractionTimeoutMs === 30001 && !runtime.config.debug, 'Cross-category settings or unit conversion changed semantics');
  // Cross-project access: one card per project, explicit matrix, read-only wording.
  await page.getByRole('heading', { name: '跨项目访问', exact: true }).waitFor();
  await page.getByLabel('过滤项目').fill('dsh-md-memory');
  assert(await page.locator('.mm-access-card').count() === 1, 'Filter narrows the project cards');
  const userToggle = page.getByLabel('在 dsh-md-memory 会话中读取 用户记忆（跨项目共享）', { exact: true });
  await userToggle.waitFor();
  assert(await userToggle.isChecked(), 'The user scope is granted by default');
  await userToggle.uncheck();
  await page.getByLabel('在 dsh-md-memory 会话中读取 additional-1', { exact: true }).check();
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '配置已保存并生效' }).waitFor();
  const matrix = runtime.config.crossProject;
  assert(matrix['dsh-md-memory-demo']?.join(',') === 'additional-project-1', `Grant not saved: ${JSON.stringify(matrix['dsh-md-memory-demo'])}`);
  assert(Object.keys(matrix).length === 36, `Saved matrix must name every project: ${Object.keys(matrix).length}`);
  assert((await readFile(join(root, 'SETTINGS.md'), 'utf8')).includes('dsh-md-memory-demo'), 'Grants are not persisted in SETTINGS.md');
  await page.screenshot({ path: join(output, 'settings-light.png'), fullPage: true });
  await page.addStyleTag({ content: `.mm-page{--dsw-alias-bg-base:#141a1b;--dsw-alias-bg-layer-1:#1c2526;--dsw-alias-label-primary:#e8eeec;--dsw-alias-label-secondary:#a7b8b3;--dsw-alias-border-l3:#354441;--dsw-alias-brand-primary:#487dee;--dsw-alias-interactive-bg-hover:#283432;--dsw-alias-state-error-primary:#ff9c93}` });
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(output, 'settings-dark.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(output, 'settings-mobile.png'), fullPage: true });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile horizontal overflow');
  await page.getByRole('button', { name: '记忆库', exact: true }).click(); await page.screenshot({ path: join(output, 'library-mobile.png'), fullPage: true });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile library overflow');
  // Moving a memory to another scope: destination list, name conflict, then user -> project.
  await page.setViewportSize({ width: 1280, height: 900 });
  await seed('project', 'subagent', 'reference', '目标范围已占用的名字', '用于验证移动时的同名冲突。', '## 冲突\n目标范围已有同名记忆。');
  await page.getByRole('button', { name: /用户记忆/ }).first().click();
  await page.getByRole('heading', { name: '子任务优先使用本机 DSH' }).click();
  await page.getByRole('button', { name: '移动', exact: true }).click();
  await page.getByRole('dialog', { name: '移动记忆' }).waitFor();
  const destinationOptions = page.getByLabel('移动目标范围').locator('option');
  assert(await destinationOptions.count() === 36, `Move must offer every other scope: ${await destinationOptions.count()}`);
  await page.getByLabel('移动目标范围').selectOption('dsh-md-memory-demo');
  await page.getByRole('button', { name: '确认移动', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'already has a memory named' }).waitFor();
  assert((await runtime.store.read('user', 'subagent')).name === 'subagent', 'A refused move must leave the source in place');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  const beforeMove = await runtime.store.read('user', 'expose-errors');
  await page.getByRole('heading', { name: '错误应当可见' }).click();
  await page.getByRole('button', { name: '移动', exact: true }).click();
  await page.getByRole('dialog', { name: '移动记忆' }).waitFor();
  await page.getByLabel('移动目标范围').selectOption('dsh-md-memory-demo');
  await page.screenshot({ path: join(output, 'move-dialog-light.png'), fullPage: true });
  await page.getByRole('button', { name: '确认移动', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '已移动到' }).waitFor();
  const afterMove = await runtime.store.read('project', 'expose-errors', project);
  assert(afterMove.body === beforeMove.body && afterMove.created === beforeMove.created && afterMove.revision === beforeMove.revision, 'Move did not preserve content, creation time or revision');
  const sourceGone = await runtime.store.read('user', 'expose-errors').then(() => false, error => error.code === 'ENOENT');
  assert(sourceGone, 'The source copy survived the move');
  assert(await page.locator('.mm-library-heading h2').textContent() === 'dsh-md-memory', 'The page did not follow the memory to the destination scope');
  assert(await page.getByLabel('标题', { exact: true }).inputValue() === '错误应当可见', 'The moved memory was not reopened in the destination');
  await page.screenshot({ path: join(output, 'move-light.png'), fullPage: true });
  // Clearing a whole project scope: the dialog names the scope and the entry count,
  // cancelling changes nothing, the shared user scope offers no wipe, and the
  // confirmed wipe also removes disabled entries while the project itself stays.
  await runtime.store.write({ scope: 'project', name: 'disabled-rule', type: 'project', title: '已停用的项目记忆', description: '清空时也应被删除。',
    body: '停用条目的正文。', status: 'disabled', source: { session: 'ui-fixture', turn: 1, kind: 'explicit-user' } }, project);
  await page.getByRole('button', { name: '刷新记忆', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '已刷新' }).waitFor();
  const projectEntryCount = (await runtime.store.snapshot(project, true)).memories.filter(memory => memory.scope === 'project').length;
  assert(projectEntryCount >= 6, `The fixture should hold several project entries: ${projectEntryCount}`);
  await page.getByRole('button', { name: '清空项目记忆', exact: true }).click();
  const resetDialog = page.getByRole('alertdialog', { name: '清空项目记忆' });
  await resetDialog.waitFor();
  assert((await resetDialog.textContent()).includes(`将删除 ${projectEntryCount} 条记忆`), 'The wipe dialog names the scope and the number of entries');
  await page.screenshot({ path: join(output, 'reset-dialog-light.png'), fullPage: true });
  await resetDialog.getByRole('button', { name: '取消', exact: true }).click();
  assert(await resetDialog.count() === 0, 'Cancelling closes the wipe dialog');
  assert((await runtime.store.snapshot(project, true)).memories.filter(memory => memory.scope === 'project').length === projectEntryCount, 'Cancelling the wipe must delete nothing');
  await page.getByRole('button', { name: /用户记忆/ }).first().click();
  assert(await page.getByRole('button', { name: '清空项目记忆', exact: true }).count() === 0, 'The shared user scope offers no whole-scope wipe');
  await page.getByRole('button', { name: /dsh-md-memory/ }).first().click();
  await page.getByRole('button', { name: '清空项目记忆', exact: true }).click();
  await page.getByRole('alertdialog', { name: '清空项目记忆' }).getByRole('button', { name: '确认删除', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '已清空' }).waitFor();
  const wiped = (await runtime.store.snapshot(project, true)).memories.filter(memory => memory.scope === 'project');
  assert(wiped.length === 0, `The project scope must be empty after the wipe: ${wiped.map(memory => memory.name).join(', ')}`);
  assert((await runtime.store.snapshot()).memories.some(memory => memory.name === 'communication'), 'The shared user scope survives a project wipe');
  assert(await page.getByText('这里还没有记忆').count() === 1, 'The wiped project shows its empty state');
  assert(await page.locator('.mm-library-heading h2').textContent() === 'dsh-md-memory', 'A wiped project keeps its page entry');
  await page.screenshot({ path: join(output, 'reset-after-light.png'), fullPage: true });
  assert(!errors.length, errors.join('\n'));
  console.log('Browser passed: compact panes, scroll, drag limits, grip hover, CRUD, hidden metadata, CAS conflict/draft, memory moves, project wipe with confirmation, settings categories/units/live apply, cross-project grants, light/dark and narrow layout.');
} finally {
  await browser.close(); await new Promise(resolve => server.close(resolve)); await runtime.logger.flush(); await ctx.fiber.dispose();
  await rm(root, { recursive: true, force: true }); await rm(moduleFile);
}

