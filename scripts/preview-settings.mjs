import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ executablePath: 'C:/Users/89123/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await mkdir('release/ui-options', { recursive: true });
  await page.goto('http://127.0.0.1:18743');
  await page.getByRole('button', { name: '配置', exact: true }).click();
  for (const design of ['a', 'b', 'c']) {
    await page.locator(`[data-design=${design}]`).click();
    await page.screenshot({ path: `release/ui-options/${design}-desktop.png`, fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: '窄屏预览', exact: true }).click();
    await page.screenshot({ path: `release/ui-options/${design}-mobile.png`, fullPage: true, animations: 'disabled' });
    if (await page.locator('.surface').evaluate(el => el.scrollWidth > el.clientWidth)) throw Error(`overflow ${design}`);
    await page.getByRole('button', { name: '桌面预览', exact: true }).click();
    await page.getByRole('button', { name: '切换深色', exact: true }).click();
    await page.screenshot({ path: `release/ui-options/${design}-dark.png`, fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: '切换浅色', exact: true }).click();
    if (design !== 'c') {
      await page.locator('[data-category=write]').click();
      await page.getByRole('checkbox', { name: '后台自动提炼', exact: true }).uncheck();
      await page.locator('[data-category=maintenance]').click();
      await page.getByRole('checkbox', { name: '详细日志', exact: true }).uncheck();
    } else {
      await page.getByRole('textbox', { name: '搜索配置', exact: true }).fill('模型');
      await page.getByRole('textbox', { name: '模型 ID', exact: true }).fill('example-model');
    }
    await page.getByRole('button', { name: '撤销', exact: true }).click();
  }
  await page.locator('[data-design=b]').click();
  await page.getByRole('spinbutton', { name: '短索引预算', exact: true }).fill('8');
  if (!(await page.locator('#index-preview').innerText()).includes('8 KiB')) throw Error('preview failed');
  await page.getByRole('checkbox', { name: '自动召回正文', exact: true }).uncheck();
  if (!(await page.locator('#body-preview').innerText()).includes('Agent 可主动检索')) throw Error('disabled recall preview failed');
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  await page.getByRole('button', { name: '我选 B', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const design of ['a', 'b', 'c']) {
    await page.locator(`[data-design=${design}]`).click();
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error(`page overflow ${design}`);
  }
  if (errors.length) throw Error(errors.join('\n'));
  await writeFile('release/ui-options/validation.json', JSON.stringify({ designs: 3, desktop: true, narrow: true, dark: true, controls: true, search: true, behaviorPreview: true, errors }, null, 2));
  console.log('Three prototypes passed desktop/narrow/dark render and controls, search, behavior preview.');
} finally { await browser.close(); }
