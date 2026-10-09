import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'C:/Users/89123/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe'});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1150}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:18743');await page.getByRole('button',{name:'大量数据示例',exact:true}).click();const results=[];
  for(const design of ['a','b','c']){
    await page.locator('[data-design='+design+']').click();
    if(await page.locator('[data-edit=type]').count()||await page.getByText('类型',{exact:true}).count())throw Error('type remains');
    const projects=page.locator(design==='a'?'.memory-scopes':'.scope-strip'),list=page.locator('#memory-list');
    for(const region of [projects,list]){if(!await region.evaluate(el=>el.scrollHeight>el.clientHeight))throw Error('scroll overflow missing '+design);}
    const box=await projects.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+Math.min(50,box.height/2));await page.mouse.wheel(0,500);await page.waitForTimeout(100);
    if(!await projects.evaluate(el=>el.scrollTop>0))throw Error('project wheel failed '+design);
    if(await list.evaluate(el=>el.scrollTop)!==0)throw Error('wheel leaked into memory list '+design);
    const listBox=await list.boundingBox();await page.mouse.move(listBox.x+listBox.width/2,listBox.y+40);await page.mouse.wheel(0,500);await page.waitForTimeout(100);
    if(!await list.evaluate(el=>el.scrollTop>0))throw Error('memory wheel failed '+design);
    for(const key of ['projects','memories']){
      const separator=page.getByRole('separator',{name:key==='projects'?'项目与记忆分界':'记忆与编辑分界',exact:true});
      const orientation=await separator.getAttribute('aria-orientation'),before=Number(await separator.getAttribute('aria-valuenow')),handle=await separator.boundingBox();
      await page.mouse.move(5,5);
      const colors=()=>separator.evaluate(el=>({background:getComputedStyle(el).backgroundColor,line:getComputedStyle(el,'::before').backgroundColor,grip:getComputedStyle(el.querySelector('span')).backgroundColor}));
      const normalColors=await colors();await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);const hoverColors=await colors();
      if(normalColors.background!==hoverColors.background||normalColors.line!==hoverColors.line||normalColors.grip===hoverColors.grip)throw Error('hover must change grip only');
      await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2+(orientation==='vertical'?40:0),handle.y+handle.height/2+(orientation==='horizontal'?30:0),{steps:8});await page.mouse.up();
      const after=Number(await separator.getAttribute('aria-valuenow'));if(after<=before)throw Error('drag failed '+design+'/'+key);
      await separator.focus();await page.keyboard.press('Home');if(Number(await separator.getAttribute('aria-valuenow'))!==Number(await separator.getAttribute('aria-valuemin')))throw Error('min clamp failed');
      await page.keyboard.press('End');if(Number(await separator.getAttribute('aria-valuenow'))!==Number(await separator.getAttribute('aria-valuemax')))throw Error('max clamp failed');
      await separator.dblclick();
    }
    if(design==='a'&&await page.locator('.memory-editor').evaluate(el=>el.clientWidth)<320)throw Error('editor minimum lost');
    const cardHeight=design==='c'?await page.locator('.table-row').first().evaluate(el=>el.clientHeight):await page.locator('.memory-item').first().evaluate(el=>el.clientHeight);
    if(cardHeight>82)throw Error('card too tall '+cardHeight);
    await projects.evaluate(el=>el.scrollTop=0);await list.evaluate(el=>el.scrollTop=0);
    await page.screenshot({path:'release/ui-options/'+design+'-memory-dense.png',fullPage:true,animations:'disabled'});results.push({design,projectCount:await page.locator('[data-scope]').count(),memoryCount:await page.locator('[data-memory]').count(),cardHeight,scroll:true,drag:true,minMax:true,hoverGripOnly:true});
  }
  if(errors.length)throw Error(errors.join('\n'));await writeFile('release/ui-options/density-validation.json',JSON.stringify({results,errors},null,2));console.log('Dense lists passed independent wheel scroll, real drag, min/max, editor minimum and card height checks.');
}finally{await browser.close();}
