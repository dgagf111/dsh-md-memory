import { useEffect, useRef, useState } from 'react';
import type { Group } from '../management.js';
import type { Memory, WriteInput } from '../types.js';
import { api as defaultApi, type MemoryApi, type SettingsValues, type SettingsView, type Target } from './api.js';
import { Icon } from './Icon.js';
import { Settings } from './Settings.js';
import { grantsSupported, settingsPayload } from './matrix.js';
import { PaneLayout } from './PaneLayout.js';
import styles from './style.css';

const targetOf = (group: Group): Target => ({ scope: group.scope, ...(group.scope === 'project' ? { projectId: group.id } : {}) });
const emptyMemory = (group: Group): Memory => ({ id: '', name: '', title: '', description: '', type: group.scope === 'user' ? 'user' : 'project', scope: group.scope, body: '', tags: [], aliases: [], paths: [], created: '', modified: '', revision: 0, pinned: false, status: 'active', source: { kind: 'explicit-user', session: 'memory-page', turn: 0 }, filePath: '', hash: '', sourceKey: group.scope === 'user' ? 'user' : group.id });
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
const modifiedLabel = (value: string) => new Date(value).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
function MatchFields({ memory, update }: { memory: Memory; update: (key: 'tags' | 'aliases' | 'paths', value: string[]) => void }) {
  const [lines, setLines] = useState({ tags: memory.tags.join(', '), aliases: memory.aliases.join(', '), paths: memory.paths.join(', ') });
  return <details className="mm-metadata"><summary>标签与匹配线索</summary>{(['tags', 'aliases', 'paths'] as const).map(key => <label key={key}>{key === 'tags' ? '标签（逗号分隔）' : key === 'aliases' ? '别名（逗号分隔）' : '关联文件路径（逗号分隔）'}<input value={lines[key]} onChange={event => { const value = event.target.value; setLines(current => ({ ...current, [key]: value })); update(key, value.split(/[,，]/).map(value => value.trim()).filter(Boolean)); }}/></label>)}</details>;
}
export function MemoryPage({ api = defaultApi }: { api?: MemoryApi }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [selected, setSelected] = useState('user');
  const [tab, setTab] = useState<'memories' | 'settings'>('memories');
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<Memory | null>(null);
  const [original, setOriginal] = useState<Memory | null>(null);
  const [view, setView] = useState<SettingsView | null>(null);
  const [settings, setSettings] = useState<SettingsValues | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const [moveTo, setMoveTo] = useState<string | null>(null);
  const readController = useRef<AbortController | null>(null);
  const movePanel = useRef<HTMLDivElement | null>(null);
  const resetPanel = useRef<HTMLDivElement | null>(null);
  const removePanel = useRef<HTMLDivElement | null>(null);
  const group = groups.find(g => g.id === selected) ?? groups[0];
  const dirty = editor !== null && JSON.stringify(editor) !== JSON.stringify(original);
  const settingsDirty = settings !== null && JSON.stringify(settings) !== JSON.stringify(view?.values);
  async function load(signal?: AbortSignal) {
    const [rows, config] = await Promise.all([api.groups(signal), api.settings(signal)]);
    setGroups(rows); setView(config); setSettings(config.values); setLoading(false);
  }
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch(error => { if (!controller.signal.aborted) { setError(errorText(error)); setLoading(false); } });
    return () => { controller.abort(); readController.current?.abort(); };
  }, [api]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty || settingsDirty) { event.preventDefault(); } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, settingsDirty]);
  // The confirmation sits after the sticky footer, so opening it must reveal it.
  useEffect(() => { if (moveTo !== null) movePanel.current?.scrollIntoView({ block: 'nearest' }); }, [moveTo]);
  // The wipe dialog sits at the top of the scrollable library, so reveal it as well.
  useEffect(() => { if (resetConfirm) resetPanel.current?.scrollIntoView({ block: 'nearest' }); }, [resetConfirm]);
  useEffect(() => { if (removeConfirm) removePanel.current?.scrollIntoView({ block: 'nearest' }); }, [removeConfirm]);
  const leaveEditor = () => !dirty || window.confirm('这条记忆有未保存的更改。放弃更改？');
  const chooseGroup = (id: string) => {
    if (!leaveEditor()) return;
    readController.current?.abort(); setReading(false); setSelected(id); setEditor(null); setOriginal(null); setDeleteConfirm(false); setResetConfirm(false); setRemoveConfirm(false); setMoveTo(null); setError(''); setSearch('');
  };
  const changeTab = (next: typeof tab) => {
    if (busy) return;
    if (next === tab) return;
    if (tab === 'memories' && !leaveEditor()) return;
    // Keep settings drafts while switching views; a separate save button commits them.
    readController.current?.abort(); setReading(false); setEditor(null); setOriginal(null); setDeleteConfirm(false); setResetConfirm(false); setRemoveConfirm(false); setMoveTo(null); setTab(next); setError('');
  };
  async function open(name: string) {
    if (!group || !leaveEditor()) return;
    readController.current?.abort(); const controller = new AbortController(); readController.current = controller;
    setReading(true); setEditor(null); setOriginal(null); setError(''); setNotice(''); setDeleteConfirm(false); setResetConfirm(false); setRemoveConfirm(false); setMoveTo(null);
    try { const memory = await api.read(targetOf(group), name, controller.signal); if (!controller.signal.aborted) { setEditor(memory); setOriginal(memory); } }
    catch (error) { if (!controller.signal.aborted) setError(errorText(error)); }
    finally { if (!controller.signal.aborted) setReading(false); }
  }
  async function perform(action: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  }
  async function saveMemory() {
    if (!editor || !group) return;
    const data: WriteInput & { projectId?: string } = { name: editor.name, title: editor.title, description: editor.description, type: editor.type, body: editor.body,
      tags: editor.tags, aliases: editor.aliases, paths: editor.paths, pinned: editor.pinned, status: editor.status, source: editor.source,
      ...targetOf(group), expectedRevision: original?.revision ?? 0, expectedHash: original?.hash ?? '' };
    await perform(async () => {
      const result = await api.write(data); setEditor(result.memory); setOriginal(result.memory); setGroups(await api.groups());
      setNotice(result.warnings.length ? `已保存；上下文刷新异常：${result.warnings.join('；')}` : '记忆已保存，下一次请求即可使用。');
    });
  }
  async function removeMemory() {
    if (!editor || !group) return;
    await perform(async () => {
      const result = await api.forget(targetOf(group), editor); setEditor(null); setOriginal(null); setDeleteConfirm(false); setGroups(await api.groups());
      setNotice(result.warnings.length ? `已删除；上下文刷新异常：${result.warnings.join('；')}` : '记忆已删除，之后只有明确要求重新记住才会恢复。');
    });
  }
  async function moveMemory() {
    if (!editor || !group || moveTo === null) return;
    const destination = groups.find(item => item.id === moveTo);
    if (!destination) return;
    await perform(async () => {
      const result = await api.move(targetOf(group), targetOf(destination), editor);
      const rows = await api.groups(); setGroups(rows);
      const landed = rows.find(item => item.id === destination.id);
      readController.current?.abort(); setReading(false); setMoveTo(null); setDeleteConfirm(false); setResetConfirm(false); setRemoveConfirm(false); setSearch(''); setSelected(landed?.id ?? destination.id);
      if (landed) {
        try { const memory = await api.read(targetOf(landed), result.memory.name); setEditor(memory); setOriginal(memory); }
        catch { setEditor(null); setOriginal(null); }
      } else { setEditor(null); setOriginal(null); }
      setNotice(result.warnings.length ? `已移动到「${destination.label}」；上下文刷新异常：${result.warnings.join('；')}` : `已移动到「${destination.label}」，下一次请求即可使用。`);
    });
  }
  /**
   * Erases every memory of the selected project. The dialog names the scope and
   * the entry count first; the host refuses the user scope and requires the
   * confirmation flag, so this action can never run by accident.
   */
  async function resetProject() {
    if (!group || group.scope !== 'project' || !group.project) return;
    const scope = group;
    await perform(async () => {
      const result = await api.reset(targetOf(scope));
      const rows = await api.groups(); setGroups(rows);
      readController.current?.abort(); setReading(false); setEditor(null); setOriginal(null); setDeleteConfirm(false); setResetConfirm(false); setRemoveConfirm(false); setMoveTo(null); setSearch('');
      setNotice(result.warnings.length
        ? `已清空「${scope.label}」的项目记忆：删除 ${result.removed} 条；上下文刷新异常：${result.warnings.join('；')}`
        : `已清空「${scope.label}」的项目记忆：删除 ${result.removed} 条。这里不会再自动重新生成记忆。`);
    });
  }
  /**
   * Removes the selected project from the memory library altogether. The host
   * refuses any scope that still holds entries (the page also disables the
   * action then, and while diagnostics remain), so this is only reachable for a
   * cleared project; the dialog names the scope and says what happens when the
   * workspace is used again.
   */
  async function removeProject() {
    if (!group || group.scope !== 'project' || !group.project) return;
    const scope = group;
    await perform(async () => {
      const result = await api.removeProject(targetOf(scope));
      const rows = await api.groups(); setGroups(rows);
      readController.current?.abort(); setReading(false); setEditor(null); setOriginal(null); setDeleteConfirm(false); setResetConfirm(false); setRemoveConfirm(false); setMoveTo(null); setSearch('');
      const landed = rows.find(item => item.id === scope.id) ? scope.id : (rows.find(item => item.scope === 'user')?.id ?? scope.id);
      setSelected(landed);
      setNotice(result.warnings.length
        ? `已删除记忆项目「${scope.label}」；上下文刷新异常：${result.warnings.join('；')}`
        : `已删除记忆项目「${scope.label}」。同一个工作区再次写入记忆时会新建一个空项目。`);
    });
  }
  const entries = group?.entries.filter(memory => `${memory.title} ${memory.description} ${memory.name} ${memory.tags.join(' ')}`.toLowerCase().includes(search.toLowerCase())) ?? [];
  const projects = groups.filter(item => item.scope === 'project' && item.project);
  const destinations = groups.filter(item => item.id !== group?.id && (item.scope === 'user' || item.project));
  const grants = view ? grantsSupported(view.values) : false;
  const update = <K extends keyof Memory>(key: K, value: Memory[K]) => setEditor(current => current && ({ ...current, [key]: value }));
  return <section className="mm-page"><style>{styles}</style>
    <header className="mm-header"><div className="mm-heading"><span className="mm-mark"><Icon size={25}/></span><div><h1>记忆</h1><p>让有用的信息，留到下一次。</p></div></div><div className="mm-top-actions"><button className="mm-button mm-icon-button" title="刷新" aria-label="刷新记忆" disabled={busy || loading} onClick={() => { if (!leaveEditor() || (settingsDirty && !window.confirm('刷新会放弃未保存的配置。继续？'))) return; setEditor(null); setOriginal(null); void perform(async () => { await load(); setNotice('已刷新。'); }); }}><Icon name="refresh"/></button><nav className="mm-tabs" aria-label="记忆页面"><button className={tab === 'memories' ? 'is-active' : ''} onClick={() => changeTab('memories')}>记忆库</button><button className={tab === 'settings' ? 'is-active' : ''} onClick={() => changeTab('settings')}><Icon name="settings"/>配置{settingsDirty && <span className="mm-dot"/>}</button></nav></div></header>
    {error && <div className="mm-message mm-error" role="alert"><strong>操作未完成</strong><span>{error}</span><button className="mm-button" disabled={busy} onClick={() => void perform(async () => { await load(); setNotice('已重新加载列表与配置。编辑草稿保留；请重新打开记忆获取最新版本。'); })}>重新加载</button></div>}
    {notice && <div className="mm-message" role="status"><Icon name="check"/><span>{notice}</span></div>}
    {loading ? <div className="mm-loading" aria-label="正在加载记忆"><div/><div/><div/></div> : tab === 'settings' && view && settings ? <Settings view={view} values={settings} setValues={setSettings} busy={busy} dirty={settingsDirty} projects={projects} grantsSupported={grants} reset={() => setSettings(view.values)} save={() => void perform(async () => {
      const result = await api.saveSettings(settingsPayload(settings, projects), view.hash); setView(result); setSettings(result.values);
      const stale = result.stale?.length ? `已忽略不存在的项目：${result.stale.join('、')}。` : '';
      setNotice(result.warnings?.length ? `配置已保存；${result.warnings.join('；')}` : `配置已保存并生效。${stale}`);
    })}/> : <PaneLayout navigation={
      <aside className="mm-library-nav" aria-label="记忆范围"><h2>个人与项目</h2><div className="mm-group-list">{groups.map(item => <button key={item.id} className={`mm-group ${selected === item.id ? 'is-active' : ''}`} aria-pressed={selected === item.id} disabled={busy} onClick={() => chooseGroup(item.id)}><Icon name={item.scope === 'user' ? 'user' : 'folder'}/><span><strong>{item.label}</strong><small>{item.scope === 'user' ? '跨项目共享' : item.project?.cwd ?? '元数据异常'}</small></span><span className="mm-count">{item.entries.length}</span></button>)}</div><p className="mm-nav-note">项目来自会话工作区。独立仓库各自保存，同一仓库的 worktree 共用记忆。</p></aside>} library={
      <main className="mm-library"><div className="mm-library-heading"><div><h2>{group?.label ?? '记忆库'}</h2><p>{group?.scope === 'user' ? '你的偏好与长期约定，适用于不同项目。' : group?.project?.cwd ?? '选择一个范围查看记忆。'}</p></div><div className="mm-library-actions">{group?.scope === 'project' && group.project && <button className="mm-button mm-danger" disabled={busy} title="删除这个项目的全部记忆，包括修订历史与遗忘标记" onClick={() => { if (!leaveEditor()) return; setMoveTo(null); setError(''); setRemoveConfirm(false); setResetConfirm(true); }}><Icon name="trash"/>清空项目记忆</button>}{group?.scope === 'project' && group.project && <span className="mm-action-hint" title={group.entries.length ? `还有 ${group.entries.length} 条记忆，先清空项目记忆才能删除整个项目` : group.diagnostics.length ? '这个项目目录里还有无法解析的文件；先按诊断信息处理，再删除整个项目' : '从记忆库删除这个项目，包括它的项目身份文件'}><button className="mm-button mm-danger" disabled={busy || group.entries.length > 0 || group.diagnostics.length > 0} onClick={() => { if (!leaveEditor()) return; setMoveTo(null); setError(''); setResetConfirm(false); setRemoveConfirm(true); }}><Icon name="trash"/>删除记忆项目</button></span>}<button className="mm-button mm-primary" disabled={busy || !group || !!group.diagnostics.length && !group.project && group.scope === 'project'} onClick={() => { if (!group || !leaveEditor()) return; readController.current?.abort(); setReading(false); const fresh = emptyMemory(group); setEditor(fresh); setOriginal(fresh); setDeleteConfirm(false); setResetConfirm(false); setRemoveConfirm(false); setError(''); }}><Icon name="plus"/>新建记忆</button></div></div>
        {resetConfirm && group?.scope === 'project' && group.project && <div className="mm-reset-confirm" role="alertdialog" aria-label="清空项目记忆" ref={resetPanel}><strong>清空「{group.label}」的全部记忆？</strong><p>将删除 {group.entries.length} 条记忆，以及它们的修订历史与遗忘标记（{group.project.cwd}）。此操作不可撤销。</p><p className="mm-reset-warning">删除后不会自动重新生成记忆；需要时由 Agent 主动写入或在页面上重新保存。</p><div><button className="mm-button" type="button" disabled={busy} onClick={() => setResetConfirm(false)}>取消</button><button className="mm-button mm-danger" type="button" disabled={busy} onClick={() => void resetProject()}>确认删除</button></div></div>}
        {removeConfirm && group?.scope === 'project' && group.project && <div className="mm-remove-confirm" role="alertdialog" aria-label="删除记忆项目" ref={removePanel}><strong>删除记忆项目「{group.label}」？</strong><p>将删除这个项目的记忆目录与项目身份文件（{group.project.cwd}），记忆库不再列出它。此操作不可撤销。</p><p className="mm-remove-warning">同一个工作区之后再次写入记忆时，会新建一个空项目；要保留项目条目就用「清空项目记忆」。</p><div><button className="mm-button" type="button" disabled={busy} onClick={() => setRemoveConfirm(false)}>取消</button><button className="mm-button mm-danger" type="button" disabled={busy} onClick={() => void removeProject()}>确认删除项目</button></div></div>}
        {group?.diagnostics.map((diagnostic, i) => <div className="mm-message mm-error" key={i}><span>{diagnostic.code}：{diagnostic.message}</span></div>)}
        <div className="mm-list-tools"><label className="mm-search"><Icon name="search"/><input aria-label="搜索记忆" value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索标题、摘要或标签"/></label></div>
        <div className="mm-entry-list">{entries.length ? entries.map(memory => <button className={`mm-entry ${editor?.name === memory.name ? 'is-active' : ''}`} key={memory.id} disabled={busy} onClick={() => void open(memory.name)}><div className="mm-entry-title"><h3>{memory.title}</h3>{memory.status === 'disabled' && <span className="mm-muted">已停用</span>}</div><p>{memory.description}</p><div className="mm-entry-bottom"><span>{memory.name}.md</span><span className="mm-date">{new Date(memory.modified).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}</span></div></button>) : <div className="mm-empty"><Icon size={35}/><h3>{search ? '没有匹配的记忆' : '这里还没有记忆'}</h3><p>{search ? '换一个关键词再试试。' : '从一条值得保留的约定开始。你也可以在对话中让 Agent 记住它。'}</p></div>}</div>
      </main>} editor={
      (editor || reading) ? <aside className="mm-editor" aria-label="记忆编辑器">{reading ? <div className="mm-loading" aria-label="正在读取记忆"><div/><div/></div> : editor && <form onSubmit={event => { event.preventDefault(); void saveMemory(); }}><fieldset disabled={busy}>
        <div className="mm-editor-heading"><div><h2>{original?.revision ? '编辑记忆' : '新建记忆'}</h2><p>{original?.revision ? `上次修改 ${modifiedLabel(original.modified)} · ${group?.label}` : group?.label}</p></div><button type="button" className="mm-button" disabled={busy} onClick={() => { if (leaveEditor()) { setEditor(null); setOriginal(null); } }}>关闭</button></div>
        <label>标题<input required maxLength={160} value={editor.title} onChange={event => update('title', event.target.value)} placeholder="一句话描述这条记忆"/></label>
        <div className="mm-editor-row"><label>文件名<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={editor.name} readOnly={!!original?.revision} onChange={event => update('name', event.target.value)} placeholder="memory-name"/></label></div>
        <label>短摘要<textarea required maxLength={500} rows={2} value={editor.description} onChange={event => update('description', event.target.value)} placeholder="用来判断何时召回，不放整段正文"/></label>
        <label className="mm-body-label"><span>正文 <small>Markdown</small></span><textarea className="mm-body" required maxLength={32000} rows={10} value={editor.body} onChange={event => update('body', event.target.value)} placeholder="## 结论&#10;写下需要长期保留的信息。"/></label>
        <MatchFields key={`${editor.name}:${editor.revision}`} memory={editor} update={update}/>
        <label className="mm-checkbox"><input type="checkbox" checked={editor.status === 'active'} onChange={event => update('status', event.target.checked ? 'active' : 'disabled')}/>参与召回</label>
        <footer className="mm-editor-footer"><span>{dirty ? '有未保存的更改' : '已保存'}</span>{!!original?.revision && <button type="button" className="mm-button" disabled={busy || dirty || !destinations.length} title={dirty ? '先保存或放弃未保存的更改，再移动这条记忆' : destinations.length ? '移动到其他项目或用户记忆' : '还没有其他可移动到的范围'} onClick={() => { setMoveTo(current => current ?? destinations[0]?.id ?? null); setDeleteConfirm(false); }}><Icon name="move"/>移动</button>}{!!original?.revision && <button type="button" className="mm-button mm-danger" disabled={busy} onClick={() => { setMoveTo(null); setDeleteConfirm(true); }}><Icon name="trash"/>删除</button>}<button className="mm-button mm-primary" disabled={busy || !dirty}>{busy ? '保存中…' : '保存记忆'}</button></footer>
        {moveTo !== null && <div className="mm-move-confirm" role="dialog" aria-label="移动记忆" ref={movePanel}><strong>把“{editor.title}”移动到哪里？</strong><select aria-label="移动目标范围" value={moveTo} onChange={event => setMoveTo(event.target.value)}>{destinations.map(item => <option key={item.id} value={item.id}>{item.scope === 'user' ? '用户记忆（跨项目共享）' : `${item.label} · ${item.project?.cwd ?? item.id}`}</option>)}</select><p>记忆的正文、标签与创建时间一起移动到此范围。原范围会删除正文与修订，并留下遗忘标记，之后不会被自动写回原范围。</p>{dirty && <p>请先保存或放弃未保存的更改。</p>}<div><button type="button" className="mm-button" disabled={busy} onClick={() => setMoveTo(null)}>取消</button><button type="button" className="mm-button mm-primary" disabled={busy || dirty} onClick={() => void moveMemory()}>确认移动</button></div></div>}
        {deleteConfirm && <div className="mm-delete-confirm" role="alert"><strong>删除“{editor.title}”？</strong><p>正文与修订历史将删除，并标记为已遗忘。</p><div><button className="mm-button" type="button" disabled={busy} onClick={() => setDeleteConfirm(false)}>取消</button><button className="mm-button mm-danger" type="button" disabled={busy} onClick={() => void removeMemory()}>确认删除</button></div></div>}
      </fieldset></form>}</aside> : <aside className="mm-editor mm-editor-empty"><div className="mm-empty"><Icon size={32}/><h3>选择一条记忆</h3><p>在列表中打开记忆，或新建一条值得保留的约定。</p></div></aside>
    }/>}
  </section>;
}
