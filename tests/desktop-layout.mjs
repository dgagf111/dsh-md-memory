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
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 } });
  await context.addCookies([{ name, value, url: origin, httpOnly: true, sameSite: 'Strict' }]);
  const page = await context.newPage();
  await page.goto(origin);
  await page.getByRole('button', { name: '记忆', exact: true }).click();
  await page.getByRole('heading', { name: '个人与项目', exact: true }).waitFor();
  await page.getByRole('button', {name:'继续',exact:true}).click({timeout:10000});
  const geometry = () => page.evaluate(() => {
    const rect = selector => { const e = document.querySelector(selector); const r = e.getBoundingClientRect(), s = getComputedStyle(e); return { x:r.x,y:r.y,width:r.width,height:r.height,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,gridColumn:s.gridColumn,gridRow:s.gridRow,display:s.display }; };
    return Object.fromEntries(['.mm-page','.mm-workspace','.mm-library-nav','.mm-library','.mm-entry-list','.mm-editor'].map(s=>[s,rect(s)]));
  });
  console.log('Before:',JSON.stringify(await geometry()));
  await page.screenshot({path:'release/ui/desktop-layout-before.png'});
  {
    if (process.argv.includes('--candidate-css')) {
    const css = await readFile('src/client/style.css','utf8');
    await page.evaluate(() => { for (const style of document.querySelectorAll('style')) if (style.textContent.includes('.mm-page')) style.remove(); });
    await page.addStyleTag({content:css});
    }
    const results=[];
    for (const width of [1280,1440,1100,920]) {
      await page.setViewportSize({width,height:820});
      await page.waitForTimeout(150);
      const g=await geometry();
      const w=g['.mm-workspace'],n=g['.mm-library-nav'],l=g['.mm-library'],e=g['.mm-editor'];
      if (w.width>850 && (Math.abs(n.y-l.y)>1 || Math.abs(l.y-e.y)>1 || Math.abs(n.height-l.height)>1 || Math.abs(l.height-e.height)>1)) throw Error('Desktop panes do not align: '+JSON.stringify(g));
      for(const key of ['.mm-page','.mm-library-nav','.mm-library','.mm-editor']) if(g[key].scrollWidth>g[key].clientWidth+1) throw Error('Horizontal overflow '+key+JSON.stringify(g));
      results.push({width,geometry:g});
      await page.screenshot({path:`release/ui/desktop-layout-${width}.png`});
    }
    await page.setViewportSize({width:1280,height:820});
    await page.locator('.mm-group').filter({hasText:'dsh-workspace'}).click();
    await page.locator('.mm-entry').first().click();
    await page.getByRole('heading',{name:'编辑记忆',exact:true}).waitFor();
    await page.screenshot({path:'release/ui/desktop-layout-editor.png'});
    await page.getByRole('button',{name:'配置',exact:true}).click();
    await page.getByRole('heading',{name:'召回与上下文',exact:true}).waitFor();
    await page.screenshot({path:'release/ui/desktop-layout-settings.png'});
    await writeFile('release/ui/desktop-layout-result.json',JSON.stringify({candidateCss:process.argv.includes('--candidate-css'),results},null,2));
    console.log('Actual host layout passed at all widths. Candidate CSS: '+process.argv.includes('--candidate-css'));
  }
} finally { await browser.close(); }


