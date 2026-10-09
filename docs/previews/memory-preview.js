// Demo data only. This prototype does not call the DSH API.
const scopes = [{ id: 'user', title: '用户记忆', path: '跨项目使用', icon: 'memory' }, { id: 'plugin', title: 'dsh-md-memory', path: 'E:/project/dsh-md-memory', icon: 'folder' }, { id: 'website', title: '个人网站', path: 'E:/project/personal-site', icon: 'folder' }];
const seed = (scope, name, title, description, body, tags) => ({ id: scope + '/' + name, scope, name, title, description, body, tags, aliases: '', paths: '', status: true, revision: 1 });
let memories = [
  seed('user', 'communication', '用中文沟通，结论先行', '解释和交付时，先给出结果，再展开依据。', '## 沟通偏好\n默认用中文沟通。\n\n先说明结果，再解释关键依据。技术细节只在帮助理解时展开。', '沟通, 中文'),
  seed('user', 'expose-errors', '错误应当可见', '开发时保留详细日志，便于后期维护。', '## 开发约定\n不要过度兜底。遇到错误时明确报告问题，并保留足以定位原因的日志。', '开发, 日志'),
  seed('plugin', 'markdown-store', 'Markdown 是唯一存储格式', '调整持久化方式时参考这条项目约定。', '## 持久化约定\n记忆正文、索引、配置和日志都使用 Markdown 文件。\n\n不引入数据库或向量存储。', '存储, Markdown'),
  seed('plugin', 'recall-index', '短索引完整注入，正文按需召回', '构建上下文和调整召回预算时参考。', '## 召回策略\n短索引放得下时完整注入。\n\n超出预算时，按相关性排序，优先填入相关条目。正文始终按需召回。', '召回, 上下文'),
  seed('website', 'visual-style', '网站采用简洁的阅读布局', '新增页面时沿用既有的排版和留白。', '## 页面约定\n正文采用单列阅读布局。\n\n标题清晰，段落留白充足。移动端优先保证可读性。', '设计, 排版')
];
let surfaceView = 'memory', activeScope = 'user', activeMemory = memories[0].id, draft = { ...memories[0] }, draftBase = JSON.stringify(draft), memorySearch = '', deleting = false, memoryNotice = '', editorTab = 'edit';
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const memoryDirty = () => JSON.stringify(draft) !== draftBase;
const defaultPaneSizes={a:{projects:200,memories:300},b:{projects:90,memories:270},c:{projects:90,memories:220}};
const paneSizes=structuredClone(defaultPaneSizes),scrollPositions=new Map();let paneObserver;
function splitter(key,orientation){return '<div class="pane-divider '+orientation+'" role="separator" tabindex="0" aria-orientation="'+orientation+'" aria-label="'+(key==='projects'?'项目与记忆分界':'记忆与编辑分界')+'" data-divider="'+key+'" title="拖动调整；方向键微调；双击恢复默认"><span></span></div>';}
function paneLimits(key){
  const width=document.querySelector('.surface').clientWidth;
  if(design==='a')return {min:key==='projects'?160:240,max:width<=850?(key==='projects'?320:480):Math.min(key==='projects'?320:480,width-20-paneSizes.a[key==='projects'?'memories':'projects']-320)};
  return key==='projects'?{min:78,max:200}:design==='b'?{min:220,max:Math.max(220,Math.min(420,document.querySelector('.memory-b-layout').clientWidth-330))}:{min:150,max:360};
}
function applyPaneSizes(){
  const root=document.querySelector('.memory-'+design);if(!root)return;
  if(design==='a'&&document.querySelector('.surface').clientWidth>850){
    const width=document.querySelector('.memory-a').clientWidth;
    paneSizes.a.projects=Math.max(160,Math.min(paneSizes.a.projects,320,width-580));
    paneSizes.a.memories=Math.max(240,Math.min(paneSizes.a.memories,480,width-paneSizes.a.projects-340));
  }
  root.style.setProperty('--project-size',paneSizes[design].projects+'px');root.style.setProperty('--memory-size',paneSizes[design].memories+'px');
  document.querySelectorAll('[data-divider]').forEach(divider=>{const limits=paneLimits(divider.dataset.divider);divider.setAttribute('aria-valuemin',limits.min);divider.setAttribute('aria-valuemax',limits.max);divider.setAttribute('aria-valuenow',paneSizes[design][divider.dataset.divider]);divider.title=(divider.dataset.divider==='projects'?'项目区':'记忆列表')+(divider.getAttribute('aria-orientation')==='vertical'?'宽度':'高度')+' '+limits.min+'–'+limits.max+'px；拖动调整，方向键微调，双击恢复默认';});
}
function bindSplitters(){
  paneObserver?.disconnect();applyPaneSizes();
  paneObserver=new ResizeObserver(applyPaneSizes);paneObserver.observe(document.querySelector('.surface'));
  document.querySelectorAll('[data-divider]').forEach(divider=>{
    const key=divider.dataset.divider,axis=divider.getAttribute('aria-orientation')==='vertical'?'clientX':'clientY';
    const setSize=value=>{const limits=paneLimits(key);paneSizes[design][key]=Math.max(limits.min,Math.min(limits.max,value));applyPaneSizes();};
    divider.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();const start=event[axis],original=paneSizes[design][key];divider.setPointerCapture(event.pointerId);divider.classList.add('dragging');document.body.classList.add('pane-dragging');divider.onpointermove=move=>setSize(original+move[axis]-start);};
    const stop=()=>{divider.onpointermove=null;divider.classList.remove('dragging');document.body.classList.remove('pane-dragging');};divider.onpointerup=stop;divider.onlostpointercapture=stop;
    divider.ondblclick=()=>setSize(defaultPaneSizes[design][key]);
    divider.onkeydown=event=>{const limits=paneLimits(key),direction=axis==='clientX'?['ArrowLeft','ArrowRight']:['ArrowUp','ArrowDown'];if(event.key===direction[0]||event.key===direction[1]){event.preventDefault();setSize(paneSizes[design][key]+(event.key===direction[0]?-10:10));}else if(event.key==='Home'||event.key==='End'){event.preventDefault();setSize(event.key==='Home'?limits.min:limits.max);}};
  });
  for(const selector of ['.memory-scopes','.scope-strip','#memory-list','.memory-editor']){
    const element=document.querySelector(selector);if(!element)continue;const key=design+'/'+(selector.includes('scope')?'all':activeScope)+'/'+selector;element.scrollTop=scrollPositions.get(key)||0;element.addEventListener('scroll',()=>scrollPositions.set(key,element.scrollTop),{passive:true});
  }
}
function memorySelect(item) {
  if (memoryDirty()) { memoryNotice = '请先保存或撤销当前草稿，再切换记忆。'; renderMemory(); return; }
  activeMemory = item?.id; draft = item ? { ...item } : null; draftBase = JSON.stringify(draft); deleting = false; editorTab = 'edit'; memoryNotice = ''; renderMemory();
}
function memoryList() {
  const matches = memories.filter(item => item.scope === activeScope && [item.title, item.description, item.tags].join(' ').toLowerCase().includes(memorySearch.toLowerCase()));
  if (!matches.length) return '<div class="empty">'+(memorySearch?'没有匹配的记忆':'这里还没有记忆，点击“新建记忆”开始。')+'</div>';
  return matches.map(item => '<button class="memory-item '+(item.id===activeMemory?'selected':'')+'" data-memory="'+escapeHtml(item.id)+'"><span class="memory-title-line"><strong>'+escapeHtml(item.title)+'</strong><span class="memory-status">'+(!item.status?'已停用':'')+'</span></span><p>'+escapeHtml(item.description)+'</p><span class="item-bottom"><span>'+escapeHtml(item.name)+'.md</span><span>修订 '+item.revision+'</span></span></button>').join('');
}
function scopeNav() { return scopes.map(scope=>'<button data-scope="'+scope.id+'" class="scope-link '+(scope.id===activeScope?'active':'')+'">'+svg(scope.icon)+'<span><strong>'+scope.title+'</strong><small>'+scope.path+'</small></span><span class="scope-count">'+memories.filter(item=>item.scope===scope.id).length+'</span></button>').join(''); }
function editorField(key, label, multiline = false) {
  return '<label class="editor-field">'+label+(multiline?'<textarea data-edit="'+key+'" '+(key==='body'?'class="body-editor" rows="10"':'rows="2"')+'>'+escapeHtml(draft[key])+'</textarea>':'<input data-edit="'+key+'" value="'+escapeHtml(draft[key])+'" '+(key==='name'&&draft.revision?'readonly':'')+(key==='name'?' pattern="[a-z0-9]+(?:-[a-z0-9]+)*"':'')+'>')+'</label>';
}
function memoryEditor() {
  if (!draft) return '<section class="memory-editor"><div class="empty">选择一条记忆，或新建记忆。</div></section>';
  const summary = '<div class="editor-header"><div><h3>'+(draft.revision?'编辑记忆':'新建记忆')+'</h3><p>'+scopes.find(scope=>scope.id===draft.scope).title+' · '+(draft.revision?'修订 '+draft.revision:'尚未保存')+'</p></div>'+(draft.revision?'<button class="button delete-button" id="delete-memory">删除</button>':'')+'</div>';
  const fields = editorField('title','标题')+editorField('description','短索引描述',true)+'<p class="field-note">描述会进入短索引，说明这条记忆何时值得参考。</p><div class="editor-meta">'+editorField('name','文件名')+'</div>';
  const body = editorField('body','正文 Markdown',true);
  const matching = '<details class="matching"><summary>标签与匹配线索</summary>'+editorField('tags','标签（逗号分隔）')+editorField('aliases','别名（逗号分隔）')+editorField('paths','关联路径（逗号分隔）')+'</details><div class="editor-flags"><label><input type="checkbox" data-edit="status" '+(draft.status?'checked':'')+'>参与召回</label></div>';
  const confirmation = deleting?'<div class="delete-confirm"><strong>删除“'+escapeHtml(draft.title)+'”？</strong><p>这条示例记忆将从当前预览中移除。</p><div><button class="button" id="cancel-delete">取消</button><button class="button" id="confirm-delete">确认删除</button></div></div>':'';
  return '<section class="memory-editor">'+summary+'<form id="memory-form">'+fields+body+matching+'</form>'+confirmation+'</section>';
}
function memoryTable() {
  return '<div class="memory-table"><div class="table-head"><span>记忆</span><span>状态</span></div>'+memories.filter(item=>item.scope===activeScope&&[item.title,item.tags,item.description].join(' ').toLowerCase().includes(memorySearch.toLowerCase())).map(item=>'<button class="table-row '+(item.id===activeMemory?'selected':'')+'" data-memory="'+escapeHtml(item.id)+'"><span><strong>'+escapeHtml(item.title)+'</strong><small>'+escapeHtml(item.name)+'.md</small></span><span>'+(!item.status?'已停用':'参与召回')+'</span></button>').join('')+'</div>';
}
const renderSettings = render;
render = function() {
  document.querySelectorAll('[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view===surfaceView));
  if (surfaceView === 'memory') renderMemory();
  else { paneObserver?.disconnect();renderSettings(); document.getElementById('save').textContent='保存配置'; }
};
function renderMemory() {
  document.querySelectorAll('[data-design]').forEach(el=>{el.classList.toggle('active',el.dataset.design===design);el.setAttribute('aria-pressed',String(el.dataset.design===design))});
  document.getElementById('choose').textContent='我选 '+design.toUpperCase();
  document.getElementById('description').textContent={a:'A：项目导航、记忆列表与编辑器并排，浏览和修改无需来回跳转。',b:'B：集中编辑记忆；右侧提供匹配线索与作用范围说明。',c:'C：紧凑表格快速选取，下方集中编辑；适合批量查看与维护。'}[design];
  const scope=scopes.find(item=>item.id===activeScope);
  const heading='<div class="memory-heading"><div><h2>'+scope.title+'</h2><p>'+scope.path+'</p></div><button class="button primary" id="new-memory">新建记忆</button></div>';
  const search='<label class="search memory-search">'+svg('search')+'<input id="memory-search" aria-label="搜索记忆" placeholder="搜索标题、描述或标签…" value="'+escapeHtml(memorySearch)+'"></label>';
  const notice=memoryNotice?'<p class="memory-notice" role="status">'+escapeHtml(memoryNotice)+'</p>':'';
  const list='<section class="memory-library">'+heading+search+'<div id="memory-list">'+memoryList()+'</div></section>';
  const guide='<aside class="editor-guide"><h3>这条记忆如何被发现</h3><p>标题和描述构成短索引，帮助 Agent 判断是否值得读取正文。</p><div class="guide-section"><strong>匹配线索</strong><p>标签、别名和关联路径参与相关性计算。</p></div><div class="guide-section"><strong>作用范围</strong><p>用户记忆跨项目使用；项目记忆匹配当前会话工作区。</p></div><div class="guide-section"><strong>参与召回</strong><p>停用后保留文件，退出自动索引与自动正文召回。</p></div><div class="guide-section"><strong>示例文件</strong><code id="file-preview">'+(draft?escapeHtml(draft.name)+'.md':'尚未选择')+'</code></div></aside>';
  let html;
  if (design==='a') html='<div class="memory-a"><nav class="memory-scopes" aria-label="记忆范围">'+scopeNav()+'</nav>'+splitter('projects','vertical')+list+splitter('memories','vertical')+memoryEditor()+'</div>';
  else if (design==='b') html='<div class="memory-b"><div class="scope-strip" aria-label="记忆范围">'+scopeNav()+'</div>'+splitter('projects','horizontal')+'<div class="memory-b-layout">'+list+splitter('memories','vertical')+memoryEditor()+guide+'</div></div>';
  else html='<div class="memory-c"><div class="scope-strip" aria-label="记忆范围">'+scopeNav()+'</div>'+splitter('projects','horizontal')+heading+search+'<div id="memory-list">'+memoryTable()+'</div>'+splitter('memories','horizontal')+memoryEditor()+'</div>';
  document.getElementById('content').innerHTML=notice+html;
  bindMemory(); memoryState(); bindSplitters();
}
function bindMemory() {
  document.querySelectorAll('[data-memory]').forEach(button=>button.onclick=()=>memorySelect(memories.find(item=>item.id===button.dataset.memory)));
  document.querySelectorAll('[data-scope]').forEach(button=>button.onclick=()=>{
    if(memoryDirty()){memoryNotice='请先保存或撤销当前草稿，再切换记忆范围。';renderMemory();return;}
    activeScope=button.dataset.scope;memorySearch='';memorySelect(memories.find(item=>item.scope===activeScope));
  });
  document.querySelectorAll('[data-edit]').forEach(input=>input.oninput=()=>{draft[input.dataset.edit]=input.type==='checkbox'?input.checked:input.value;memoryState();});
  document.getElementById('memory-form')?.addEventListener('submit',event=>{event.preventDefault();saveMemory();});
  document.querySelectorAll('[data-editor-tab]').forEach(button=>button.onclick=()=>{editorTab=button.dataset.editorTab;renderMemory();});
  document.getElementById('memory-search').oninput=event=>{memorySearch=event.target.value;document.getElementById('memory-list').innerHTML=design==='c'?memoryTable():memoryList();document.querySelectorAll('[data-memory]').forEach(button=>button.onclick=()=>memorySelect(memories.find(item=>item.id===button.dataset.memory)));};
  document.getElementById('new-memory').onclick=()=>{
    if(memoryDirty()){memoryNotice='请先保存或撤销当前草稿，再新建记忆。';renderMemory();return;}
    activeMemory=null;draft=seed(activeScope,'','', '','', '');draft.revision=0;draftBase=JSON.stringify(null);deleting=false;memoryNotice='';editorTab='edit';renderMemory();document.querySelector('[data-edit=title]').focus();
  };
  const del=document.getElementById('delete-memory');if(del)del.onclick=()=>{deleting=true;renderMemory();};
  const cancel=document.getElementById('cancel-delete');if(cancel)cancel.onclick=()=>{deleting=false;renderMemory();};
  const confirm=document.getElementById('confirm-delete');if(confirm)confirm.onclick=()=>{memories=memories.filter(item=>item.id!==activeMemory);draftBase=JSON.stringify(draft);memorySelect(memories.find(item=>item.scope===activeScope));memoryNotice='示例记忆已删除，未修改 DSH 文件。';renderMemory();};
}
function memoryState(){const dirty=memoryDirty();document.getElementById('state').textContent=draft?(dirty?'有未保存的记忆草稿':'示例记忆 · 修订 '+draft.revision):'选择记忆开始编辑';document.getElementById('state').classList.toggle('dirty',dirty);document.getElementById('reset').disabled=!dirty;document.getElementById('save').textContent='保存记忆';document.getElementById('save').disabled=!dirty||!draft?.title.trim()||!draft?.name.trim()||!draft?.description.trim()||!draft?.body.trim();}
function saveMemory(){if(document.getElementById('save').disabled)return;const form=document.getElementById('memory-form');if(form&&!form.reportValidity())return;const id=draft.scope+'/'+draft.name;if(!draft.revision&&memories.some(item=>item.id===id)){memoryNotice='这个范围已有同名示例文件，请更换文件名。';renderMemory();return;}const saved={...draft,id,revision:draft.revision+1};memories=memories.filter(item=>item.id!==activeMemory);memories.push(saved);activeMemory=id;draft={...saved};draftBase=JSON.stringify(draft);memoryNotice='示例记忆已保存，未写入 DSH。';renderMemory();}
const saveSettingsDemo=document.getElementById('save').onclick,resetSettingsDemo=document.getElementById('reset').onclick;
document.getElementById('save').onclick=()=>surfaceView==='memory'?saveMemory():saveSettingsDemo();
document.getElementById('reset').onclick=()=>{if(surfaceView==='config'){resetSettingsDemo();return;}draftBase=JSON.stringify(draft);memorySelect(memories.find(item=>item.id===activeMemory));};
document.querySelector('.page-tabs').innerHTML='<button data-view="memory" class="active">记忆库</button><button data-view="config">配置</button>';
document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>{surfaceView=button.dataset.view;render();});
document.querySelector('.gallery-head h1').textContent='挑选你的记忆管理界面';
document.querySelector('.gallery-head p').textContent='三套完整原型：浏览与编辑记忆，也可以切换到配置页。';
const choiceCopy={a:['A · 原生工作区','项目、列表与编辑器并排；配置按分类整理。'],b:['B · 记忆工作台','集中编辑并解释匹配线索；配置旁说明召回行为。'],c:['C · 紧凑控制台','表格选取记忆，集中编辑；配置可搜索与折叠。']};
document.querySelectorAll('[data-design]').forEach(button=>{button.querySelector('strong').textContent=choiceCopy[button.dataset.design][0];button.querySelector('p').textContent=choiceCopy[button.dataset.design][1];});
const volumeButton=document.createElement('button');volumeButton.className='button';volumeButton.id='volume-demo';volumeButton.textContent='大量数据示例';document.querySelector('.utilities').append(volumeButton);let largeDemo=false;
volumeButton.onclick=()=>{
  if(memoryDirty()){memoryNotice='请先保存或撤销当前草稿，再切换示例数据。';surfaceView='memory';render();return;}
  largeDemo=!largeDemo;
  if(largeDemo){for(let i=1;i<=36;i++)scopes.push({id:'demo-project-'+i,title:'示例项目 '+String(i).padStart(2,'0'),path:'E:/project/demo-'+i,icon:'folder'});for(const scope of scopes)for(let i=1;i<=42;i++)memories.push(seed(scope.id,'demo-note-'+i,'示例记忆 '+String(i).padStart(2,'0')+' · '+['构建与发布约定','接口使用经验','工作区维护记录'][i%3],'这是一条用于体验长列表与独立滚动的示例。','## 示例正文\n仅用于界面演示。','示例'));}
  else{memories=memories.filter(item=>!item.name.startsWith('demo-note-'));scopes.splice(3);if(!scopes.some(scope=>scope.id===activeScope))activeScope='user';}
  draftBase=JSON.stringify(draft);memorySelect(memories.find(item=>item.scope===activeScope));volumeButton.textContent=largeDemo?'恢复少量数据':'大量数据示例';surfaceView='memory';render();
};
render();
