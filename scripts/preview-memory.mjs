import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'C:/Users/89123/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe'});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1150}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await mkdir('release/ui-options',{recursive:true});
  await page.goto('http://127.0.0.1:18743');
  for(const design of ['a','b','c']) {
    await page.locator('[data-design='+design+']').click();
    await page.screenshot({path:'release/ui-options/'+design+'-memory-desktop.png',fullPage:true,animations:'disabled'});
    await page.getByRole('button',{name:'窄屏预览',exact:true}).click();
    await page.screenshot({path:'release/ui-options/'+design+'-memory-mobile.png',fullPage:true,animations:'disabled'});
    if(await page.locator('.surface').evaluate(el=>el.scrollWidth>el.clientWidth))throw Error('narrow overflow '+design);
    await page.getByRole('button',{name:'桌面预览',exact:true}).click();
    await page.getByRole('button',{name:'切换深色',exact:true}).click();
    await page.screenshot({path:'release/ui-options/'+design+'-memory-dark.png',fullPage:true,animations:'disabled'});
    await page.getByRole('button',{name:'切换浅色',exact:true}).click();
    await page.locator('[data-scope=plugin]').click();
    await page.locator('[data-edit=title]').fill('Markdown 存储约定 '+design);
    await page.locator('[data-scope=user]').click();
    await page.getByText('请先保存或撤销当前草稿，再切换记忆范围。',{exact:true}).waitFor();
    await page.locator('[data-edit=status]').uncheck();
    await page.getByRole('button',{name:'保存记忆',exact:true}).click();
    await page.getByText('示例记忆已保存，未写入 DSH。',{exact:true}).waitFor();
    if(await page.locator('[data-edit=status]').isChecked())throw Error('disabled entry did not persist');
    await page.getByRole('textbox',{name:'搜索记忆',exact:true}).fill('存储约定 '+design);
    if(await page.locator('[data-memory]').count()!==1)throw Error('search mismatch '+design+': '+await page.locator('#memory-list').innerText());
    await page.getByRole('textbox',{name:'搜索记忆',exact:true}).fill('');
    await page.getByRole('button',{name:'新建记忆',exact:true}).click();
    await page.locator('[data-edit=title]').fill('示例新增 '+design);
    await page.locator('[data-edit=description]').fill('用于验证编辑器的示例。');
    await page.locator('[data-edit=name]').fill('demo-'+design);
    await page.locator('[data-edit=body]').fill('## 示例正文\n新增内容只存在本页中。');
    if(await page.locator('[data-edit=pinned]').count()||await page.getByRole('button',{name:'阅读预览',exact:true}).count())throw Error('unsupported editor action');
    await page.getByRole('button',{name:'保存记忆',exact:true}).click();
    await page.getByRole('button',{name:'删除',exact:true}).click();
    await page.getByRole('button',{name:'取消',exact:true}).click();
    await page.getByRole('button',{name:'删除',exact:true}).click();
    await page.getByRole('button',{name:'确认删除',exact:true}).click();
    if(await page.locator('[data-memory="plugin/demo-'+design+'"]').count())throw Error('delete failed');
    await page.locator('[data-scope=user]').click();
    await page.getByRole('button',{name:'配置',exact:true}).click();
    await page.getByRole('checkbox',{name:'自动召回正文',exact:true}).uncheck();
    await page.getByRole('button',{name:'撤销',exact:true}).click();
    await page.getByRole('button',{name:'记忆库',exact:true}).click();
  }
  await page.setViewportSize({width:390,height:844});
  for(const design of ['a','b','c']){
    await page.locator('[data-design='+design+']').click();
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('page overflow '+design);
  }
  if(errors.length)throw Error(errors.join('\n'));
  await writeFile('release/ui-options/memory-validation.json',JSON.stringify({designs:3,desktop:true,dark:true,narrow:true,scope:true,search:true,edit:true,disable:true,create:true,deleteCancelAndConfirm:true,noUnsupportedActions:true,draftProtection:true,configurationSwitch:true,errors},null,2));
  console.log('Three memory prototypes passed supported editor actions and layout checks.');
} finally {await browser.close();}
