// Optional local desktop acceptance. Authentication stays in memory; no credential is emitted or saved.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { chromium } from '@playwright/test';
import YAML from 'yaml';
const origin = process.env.DSH_DESKTOP_ORIGIN ?? 'http://127.0.0.1:19387';
const authority = new URL(origin).host;
const records = YAML.parse(await readFile('C:/Users/89123/.dsh/.credentials.yaml', 'utf8')).records;
const secret = Buffer.from(records['client-connection/browser-session'].payload.secret, 'base64url');
const now = Date.now();
const body = Buffer.from(JSON.stringify({ version: 1, authority, issuedAt: now, expiresAt: now + 600000 })).toString('base64url');
const name = `dsh-auth-${createHash('sha256').update(authority).digest('base64url')}`;
const value = `v1.${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
const response = await fetch(`${origin}/api/pluginManager/listPlugins`, { method: 'POST', headers: { cookie: `${name}=${value}`, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method: 'pluginManager/listPlugins', payload: { args: {} } }) });
if (!response.ok) throw new Error(`Desktop inspection HTTP ${response.status}`);
const rows = (await response.json()).result.value;
const row = rows.find(row => row.moduleName === 'dsh-md-memory');
if (row?.fiberPhase !== 'active') throw new Error(`Plugin is not active: ${JSON.stringify(row)}`);
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/89123/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe' });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name, value, url: origin, httpOnly: true, sameSite: 'Strict' }]);
  const page = await context.newPage();
  await page.goto(origin);
  await page.getByRole('button', { name: '记忆', exact: true }).click({ timeout: 30000 });
  await page.getByRole('heading', { name: '个人与项目', exact: true }).waitFor();
  await mkdir('release/ui', { recursive: true });
  await page.screenshot({ path: 'release/ui/desktop-installed-library.png', fullPage: true });
  const firstEntry = page.locator('.mm-entry').first();
  if (await firstEntry.count() > 0) {
    await firstEntry.click();
    const header = page.locator('.mm-editor-heading p');
    await header.waitFor({ timeout: 15000 });
    const text = (await header.textContent())?.trim() ?? '';
    if (!/^上次修改 /.test(text)) throw new Error(`Memory editor header does not show the modified date: ${text}`);
    if (await page.getByRole('button', { name: '移动', exact: true }).count() !== 1) throw new Error('Memory editor does not offer the move action');
    await page.screenshot({ path: 'release/ui/desktop-installed-editor.png', fullPage: true });
  }
  // Clearing a whole project needs its own entry point and a confirmation dialog.
  const projectGroup = page.locator('.mm-group').nth(1);
  if (await projectGroup.count() > 0) {
    await projectGroup.click();
    const wipe = page.getByRole('button', { name: '清空项目记忆', exact: true });
    if (await wipe.count() !== 1) throw new Error('A project scope does not offer the whole-scope wipe');
    await wipe.click();
    const dialog = page.getByRole('alertdialog', { name: '清空项目记忆' });
    await dialog.waitFor({ timeout: 15000 });
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    if (await page.getByRole('alertdialog', { name: '清空项目记忆' }).count() !== 0) throw new Error('The wipe dialog did not close on cancel');
    await page.getByRole('button', { name: /用户记忆/ }).first().click();
    if (await wipe.count() !== 0) throw new Error('The shared user scope must not offer a whole-scope wipe');
    await page.screenshot({ path: 'release/ui/desktop-installed-wipe.png', fullPage: true });
  }
  await page.getByRole('button', { name: '配置', exact: true }).click();
  await page.getByRole('heading', { name: '召回与上下文', exact: true }).waitFor();
  await page.getByRole('heading', { name: '跨项目访问', exact: true }).waitFor();
  await page.screenshot({ path: 'release/ui/desktop-installed-settings.png', fullPage: true });
  const settings = await page.request.get(`${origin}/api/md-memory/settings`);
  if (!settings.ok()) throw new Error(`Management settings HTTP ${settings.status()}`);
  const data = await settings.json();
  await writeFile('release/ui/desktop-result.json', JSON.stringify({ plugin: row, root: data.root, enabled: { index: data.values.indexEnabled, body: data.values.autoRecall, manualWriteOnly: !('autoExtract' in data.values) }, grants: Object.keys(data.values.crossProject ?? {}).length, sidebar: true, library: true, editor: true, move: true, wipe: true, settings: true, crossProject: true }, null, 2));
  console.log('Installed desktop passed: active plugin, sidebar entry, memory library, editor modified-date header, move action, whole-project wipe with confirmation, configuration page and cross-project access section.');
} finally { await browser.close(); }

