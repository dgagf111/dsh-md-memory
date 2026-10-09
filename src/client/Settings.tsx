import { useState } from 'react';
import type { Group } from '../management.js';
import type { SettingsValues, SettingsView } from './api.js';
import { Icon } from './Icon.js';

/** Cards stay open for small libraries; a wall of n² checkboxes is closed by default. */
const COLLAPSE_THRESHOLD = 12;
const USER_LABEL = '用户记忆（跨项目共享）';

interface Props {
  view: SettingsView; values: SettingsValues; setValues: (values: SettingsValues) => void; save: () => void; reset: () => void;
  busy: boolean; dirty: boolean; projects: Group[]; grantsSupported: boolean;
}
export function Settings({ view, values, setValues, save, reset, busy, dirty, projects, grantsSupported }: Props) {
  const [category, setCategory] = useState('recall');
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<string[]>([]);
  const matrix = values.crossProject ?? {};
  /** The running host predates the grants; its save whitelist would reject them. */
  const locked = busy || !grantsSupported;
  const sourcesOf = (id: string) => matrix[id] ?? ['user'];
  const query = filter.trim().toLowerCase();
  const visibleProjects = query === '' ? projects : projects.filter(project => `${project.label} ${project.project?.cwd ?? ''} ${project.id}`.toLowerCase().includes(query));
  const open = (id: string) => projects.length <= COLLAPSE_THRESHOLD || expanded.includes(id) || query !== '';
  const setSources = (id: string, sources: string[]) => setValues({ ...values, crossProject: { ...matrix, [id]: sources } });
  const toggleSource = (id: string, source: string, on: boolean) => {
    const current = sourcesOf(id);
    setSources(id, on ? [...current.filter(item => item !== source), source] : current.filter(item => item !== source));
  };
  const toggle = (key: keyof SettingsValues, label: string, help: string) => <label className="mm-setting-row" key={key}>
    <span><strong>{label}</strong><small>{help}</small></span><input className="mm-toggle" type="checkbox" checked={Boolean(values[key])} onChange={event => setValues({ ...values, [key]: event.target.checked })}/></label>;
  const number = (key: keyof SettingsValues, label: string, help: string, min: number, max: number, unit: string, scale = 1) => <label className="mm-number-field" key={key}>
    <span>{label}<small>{help}</small></span><span className="mm-number-control"><input type="number" min={min / scale} max={max / scale} step={1 / scale} required value={typeof values[key] === 'number' ? String(Number(values[key]) / scale) : ''} onChange={event => setValues({ ...values, [key]: event.target.value === '' ? '' : Math.round(Number(event.target.value) * scale) } as SettingsValues)}/><span>{unit}</span></span></label>;
  const accessCard = (project: Group) => {
    const sources = sourcesOf(project.id);
    const others = projects.filter(other => other.id !== project.id);
    const option = (source: string, label: string, help: string) => <label className="mm-access-option" key={source}>
      <input type="checkbox" checked={sources.includes(source)} disabled={locked} aria-label={`在 ${project.label} 会话中读取 ${label}`} onChange={event => toggleSource(project.id, source, event.target.checked)}/>
      <span><strong>{label}</strong><small>{help}</small></span></label>;
    return <li className="mm-access-card" key={project.id}>
      <div className="mm-access-head">
        <button type="button" className="mm-access-name" aria-expanded={open(project.id)} disabled={busy} onClick={() => setExpanded(current => current.includes(project.id) ? current.filter(id => id !== project.id) : [...current, project.id])}>
          <Icon name={open(project.id) ? 'down' : 'right'}/><span><strong>{project.label}</strong><small>{project.project?.cwd ?? project.id}</small></span>
        </button>
        <span className="mm-access-count">已开放 {sources.length}/{projects.length}</span>
        <button type="button" className="mm-button" disabled={locked || sources.length === 0} onClick={() => setSources(project.id, [])}>全部关闭</button>
      </div>
      {open(project.id) && <div className="mm-access-options">
        {option('user', USER_LABEL, '你的偏好与长期约定')}
        {others.length === 0 && <p className="mm-note">暂无可授权的其他项目。</p>}
        {others.map(other => option(other.id, other.label, other.project?.cwd ?? other.id))}
      </div>}
    </li>;
  };
  return <form className="mm-settings" onSubmit={event => { event.preventDefault(); save(); }}><fieldset disabled={busy}><div className="mm-config-layout"><nav className="mm-config-nav" aria-label="配置分类">{([['recall', '召回', 'search'], ['write', '记忆写入', 'plus'], ['maintenance', '维护', 'settings']] as const).map(([key, label, icon]) => <button type="button" key={key} className={category === key ? 'is-active' : ''} aria-pressed={category === key} onClick={() => setCategory(key)}><Icon name={icon}/>{label}</button>)}<p>设置属于插件全局。项目记忆按会话工作区自动匹配。</p></nav><div className="mm-config-main">
    {category === 'recall' && <section className="mm-config-section"><div><h2>召回与上下文</h2><p>短索引提供线索，正文随当前问题按需出现。</p></div><div>
      {toggle('indexEnabled', '注入短索引', '放得下时完整注入；超出预算时按相关性排序并持续填充。')}
      {toggle('autoRecall', '自动召回相关正文', '根据当前问题、最近两轮输入和触及的文件匹配。关闭后仍可由 Agent 主动检索。')}
      {toggle('recallProject', '包含当前项目记忆', '控制当前会话工作区自己的记忆；其他项目由下方「跨项目访问」单独授权。')}
      <div className="mm-numbers">{number('indexBytes', '短索引预算', 'UTF-8 容量，1 KiB = 1024 字节', 512, 65536, 'KiB', 1024)}{number('bodyBytes', '正文预算', '每次请求的正文总容量', 256, 65536, 'KiB', 1024)}{number('bodyLimit', '正文条目上限', '每次自动召回的最多条目数', 1, 20, '条')}</div>
      <div className="mm-access">
        <div className="mm-access-heading"><div><h3>跨项目访问</h3><p>这里配置的是「在某个项目的会话里，除了它自己，还能读到哪些记忆」。授权是单向的，且只授予读取；被授权项目的记忆最多占用上下文预算的一半。</p>{!grantsSupported && <p className="mm-access-locked" role="status">当前运行的宿主仍是旧版本，勾选暂时不可保存：重启 DSH 后即可配置。</p>}</div>{projects.length > 6 && <label className="mm-search mm-access-filter"><Icon name="search"/><input aria-label="过滤项目" value={filter} placeholder="过滤项目…" disabled={busy} onChange={event => setFilter(event.target.value)}/></label>}</div>
        {projects.length === 0
          ? <p className="mm-note">还没有其他项目。项目来自会话工作区，出现过一次后才会在这里列出。</p>
          : <ul className="mm-access-list">{visibleProjects.map(accessCard)}{visibleProjects.length === 0 && <p className="mm-note">没有匹配的项目。</p>}</ul>}
      </div>
    </div></section>}
    {category === 'write' && <section className="mm-config-section"><div><h2>记忆写入</h2><p>主动保存与成功轮后的后台提炼。</p></div><div>
      {toggle('autoExtract', '后台自动提炼', '根会话成功完成一轮后提取持久信息。关闭后不再调度新任务；已开始的任务会完成。')}
      {toggle('enableInHeadless', '允许 Headless 自动提炼', '用于命令行部署；桌面版通常无需开启。')}
      <div className="mm-numbers">{number('extractionMaxTokens', '模型输出上限', '限制一次提炼的输出', 256, 16384, 'tokens')}{number('extractionMaxOperations', '每次写入上限', '一轮提炼最多提交的记忆条目', 1, 20, '条')}{number('extractionTimeoutMs', '请求超时', '后台模型调用的最长等待时间', 1000, 120000, '秒', 1000)}{number('extractionAttempts', '尝试次数', '失败时最多尝试次数', 1, 3, '次')}</div>
      <div className="mm-model-fields"><label>提炼 Provider<input value={values.extractionProvider} placeholder="跟随当前会话" onChange={event => setValues({ ...values, extractionProvider: event.target.value })}/></label><label>提炼模型<input value={values.extractionModel} placeholder="跟随当前会话" onChange={event => setValues({ ...values, extractionModel: event.target.value })}/></label></div>
      <p className="mm-note">留空时沿用会话模型。指定模型时填写 DSH 中的准确 Provider 与模型 ID。</p>
    </div></section>}
    {category === 'maintenance' && <section className="mm-config-section"><div><h2>维护与存储</h2><p>文件透明可查，错误明确可见。</p></div><div>
      {toggle('debug', '详细日志', '记录召回评分、选择结果与提炼调度，不记录原始对话或记忆正文。')}
      <dl className="mm-storage"><dt>记忆目录</dt><dd>{view.root}</dd><dt>页面配置</dt><dd>{view.root}/SETTINGS.md</dd><dt>运行日志</dt><dd>{view.root}/logs</dd></dl>
      <p className="mm-note">目录由 DSH 插件配置决定。保存后立即生效，现有会话在下一次模型请求时使用更新后的上下文。</p>
    </div></section>}
    </div></div><footer className="mm-settings-footer"><span>{dirty ? '有未保存的配置' : '配置已同步'}</span><button type="button" className="mm-button" disabled={busy || !dirty} onClick={reset}>撤销更改</button><button className="mm-button mm-primary" disabled={busy || !dirty}><Icon name="check"/>{busy ? '保存中…' : '保存配置'}</button></footer>
  </fieldset></form>;
}
