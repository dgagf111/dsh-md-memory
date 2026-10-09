import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { HarnessError, type Message } from '@deepseek-ai/dsh-llm';
import type { Session } from '@deepseek-ai/dsh-session';
import { relative, resolve } from 'node:path';
import type {} from '@deepseek-ai/dsh-session-query';
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools';
import type { AssembleContext } from '@deepseek-ai/dsh-system-prompt';
import { createLogger } from './logging.js';
import { MemoryStore } from './store.js';
import { resolveProject } from './project.js';
import { DEFAULT_SOURCES, USER_SOURCE, handleMap, matchProject, resolveAccess, type ResolvedAccess } from './access.js';
import { rankMemories, renderIndex, renderBodies, escapeContext, type SourceContext } from './retrieval.js';
import { MEMORY_POLICY } from './prompts.js';
import { ExtractionScheduler, type ExtractionMessage } from './extraction.js';
import { createCompletion } from './completion.js';
import { memoryRoot, type PluginConfig } from './config.js';
import { MemoryError, type Memory, type ProjectIdentity, type RetrievalQuery, type Snapshot, type IndexResult, type VisibleSource } from './types.js';

interface AgentState {
  project?: ProjectIdentity; query: RetrievalQuery; snapshot: Snapshot;
  index?: IndexResult; bodies: string; turn: number; messages: ExtractionMessage[]; error?: string;
  access?: ResolvedAccess; handles: Record<string, string>;
}
const output = { schema: { type: 'json' } as const,
  render: (_args: unknown, value: unknown) => [{ type: 'text' as const, text: JSON.stringify(value) }] };
const scope = { type: 'string', enum: ['user', 'project'], required: true } as const;
const name = { type: 'string', required: true, description: '条目的 kebab-case 名称，不带 .md；与 scope 一起使用。' } as const;
const projectRef = { type: 'string', description: '已授权项目的只读 handle 或 id，形如索引里显示的 project/<handle>/<name>.md。读取当前项目时省略。' } as const;
function text(message: Message): string {
  return message.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
}
function rootAgent(agent: Agent): boolean { return !agent.session.header.delegationDepth && agent.session.header.origin !== 'subagent'; }
function headless(): boolean {
  const args = process.argv.slice(2);
  return args[0] === 'headless' || args.some((arg, i) => arg === '--profile' && args[i + 1] === 'headless') || args.includes('--profile=headless');
}

/** DSH adapter; storage and ranking remain independent of the host. */
export class MemoryRuntime {
  readonly logger;
  readonly store: MemoryStore;
  readonly scheduler: ExtractionScheduler;
  private states = new Map<string, AgentState>();
  private initializing = new Map<string, Promise<AgentState>>();
  readonly profileConfig: PluginConfig;
  /** Default sources for projects absent from the matrix; seeded once from a legacy recallUser:false. */
  legacySources: string[];
  constructor(readonly ctx: Context, readonly config: PluginConfig, profileConfig: PluginConfig = config, legacySources: readonly string[] = DEFAULT_SOURCES) {
    this.profileConfig = { ...profileConfig };
    this.legacySources = [...legacySources];
    this.logger = createLogger(memoryRoot(config), () => config.debug, (level, line) => {
      if (level === 'error') ctx.logger.error(line);
    });
    this.store = new MemoryStore(memoryRoot(config), this.logger);
    this.scheduler = new ExtractionScheduler(this.store, createCompletion(ctx, config), this.logger, config.extractionMaxOperations, config.extractionAttempts);
  }
  private async initialize(agent: Agent): Promise<AgentState> {
    const id = agent.session.id;
    if (this.initializing.has(id)) return this.initializing.get(id)!;
    if (this.states.has(id)) return this.states.get(id)!;
    const promise = (async () => {
      const state: AgentState = { query: { current: '', recent: [], touchedPaths: [] }, snapshot: { memories: [], diagnostics: [] }, bodies: '', turn: 0, messages: [], handles: {} };
      this.states.set(id, state);
      try {
        if (agent.session.header.cwd) {
          state.project = await resolveProject(agent.session.header.cwd);
          await this.store.initializeProject(state.project);
        } else this.logger.info({ event: 'project.unbound', session: id, reason: 'session-has-no-cwd' });
        await this.store.recoverAll(state.project);
        await this.refresh(agent, state);
        if (agent.session.seq > 0) await this.restoreMessages(agent, state);
        this.logger.info({ event: 'session.bound', session: id, project: state.project?.id, cwd: agent.session.header.cwd });
      } catch (error) { this.failed(id, state, error); }
      return state;
    })();
    this.initializing.set(id, promise);
    try { return await promise; } finally { this.initializing.delete(id); }
  }
  private async restoreMessages(agent: Agent, state: AgentState): Promise<void> {
    const query = this.ctx.get('sessionQuery');
    if (!query) throw new MemoryError('RESUME_REQUIRES_SESSION_QUERY', 'Resume extraction requires the DSH sessionQuery service. Live-session tools remain available.');
    using observation = await query.observeSession(agent.session.id, { projectionMode: 'none' });
    const active = new Set(agent.session.deriveMessages().map(m => m.id));
    let last: { turn: number; seq: number } | undefined;
    for (const event of observation.events) {
      if (event.seq < observation.inheritedEventCount) continue;
      if (event.type === 'user/message' && event.data.source.kind === 'user' && active.has(event.data.id)) state.messages.push({ id: event.data.id, seq: event.seq, role: 'user', text: text(event.data) });
      else if (event.type === 'assistant/message' && !event.data.interrupted && active.has(event.data.message.id)) state.messages.push({ id: event.data.message.id, seq: event.seq, role: 'assistant', text: text(event.data.message) });
      else if (event.type === 'turn/end' && event.data.reason.kind === 'completed') last = { turn: event.data.turn, seq: event.seq };
    }
    if (last) this.schedule(agent, state, last.turn, last.seq);
  }
  private failed(session: string, state: AgentState, error: unknown): void {
    state.error = error instanceof Error ? error.message : String(error);
    state.index = undefined; state.bodies = '';
    this.logger.error({ event: 'context.failed', session, project: state.project?.id }, error);
  }
  /**
   * Re-resolves the readable memory blocks and rebuilds the injected context.
   * Called on every step, so a settings save lands on the next model request.
   */
  private async refresh(agent: Agent, state: AgentState): Promise<void> {
    const registry = await this.store.projects();
    const handles = handleMap(registry.projects);
    const access = resolveAccess(state.project, registry.projects, this.config.crossProject, this.legacySources);
    state.access = access;
    state.handles = handles;
    state.snapshot = await this.store.snapshot(state.project, false, access.granted);
    const sources: SourceContext = { ownSourceKey: state.project?.id, handles };
    const ranked = rankMemories(state.snapshot.memories.filter(memory => this.visible(state, memory, true)), state.query, sources);
    state.index = renderIndex(ranked, this.config.indexBytes);
    state.bodies = this.config.autoRecall ? renderBodies(ranked, this.config.bodyBytes, this.config.bodyLimit) : '';
    state.error = undefined;
    this.logger.debug({ event: 'access.sources', session: agent.session.id, project: state.project?.id,
      user: access.user, granted: access.granted.map(project => project.id), stale: access.stale });
    this.logger.debug({ event: 'retrieval.selected', session: agent.session.id, project: state.project?.id,
      indexBytes: state.index.bytes, remainingBytes: state.index.remainingBytes, shown: state.index.shown, total: state.index.total,
      selectedIds: state.index.selectedIds, bodyBytes: Buffer.byteLength(state.bodies),
      scores: ranked.map(r => ({ id: r.memory.id, source: r.sourceKey, origin: r.origin, score: r.score, current: r.currentScore, recent: r.historyScore, path: r.pathScore })) });
  }
  /**
   * Read visibility of one entry. The matrix decides the user scope and which
   * other projects are readable; `recallProject` stays an automatic-context
   * toggle for the current project only. A failed refresh keeps the old default
   * so a transient error never hides the user scope.
   */
  private visible(state: AgentState, memory: Memory, automatic: boolean): boolean {
    if (memory.scope === 'user') return state.access ? state.access.user : true;
    const own = state.project?.id;
    if (own !== undefined && memory.sourceKey === own) return !automatic || this.config.recallProject;
    return true;
  }
  private projectInfo(state: AgentState, memory: Memory): { id: string; label: string } | null {
    if (memory.scope === 'user') return null;
    return { id: memory.sourceKey, label: state.handles[memory.sourceKey] ?? memory.sourceKey };
  }
  /** Resolves an optional project reference against the readable projects only. */
  private readTarget(state: AgentState, reference: unknown): ProjectIdentity | undefined {
    if (reference === undefined || reference === null || reference === '') return state.project;
    if (typeof reference !== 'string') throw new MemoryError('INVALID_INPUT', 'project must be a handle or project id.');
    const candidates = [state.project, ...(state.access?.granted ?? [])].filter((project): project is ProjectIdentity => project !== undefined);
    const match = matchProject(reference, candidates, state.handles);
    if (match.project) return match.project;
    if (match.ambiguous) throw new MemoryError('AMBIGUOUS_PROJECT', `project "${reference}" matches ${match.ambiguous.map(project => project.id).join(', ')}; use the full project id.`);
    throw new MemoryError('PROJECT_NOT_VISIBLE',
      `Memory tools can only read the current project and projects granted to it. To let ${state.project?.id ?? 'this session'} read ${reference}, enable it in the memory page under 配置 → 召回 → 跨项目访问.`);
  }
  private context(context: AssembleContext, kind: 'index' | 'body'): string {
    if (!context.agent || !rootAgent(context.agent)) return '';
    const state = this.states.get(context.agent.session.id);
    if (!state) return '';
    if (kind === 'body') return state.bodies;
    if (!this.config.indexEnabled) return '';
    if (state.error) return escapeContext(`记忆不可用：${state.error}。请检查 md_memory_status。`);
    return state.index?.text ?? '';
  }
  async ready(agent: Agent): Promise<AgentState> {
    if (!rootAgent(agent)) throw new MemoryError('SUBAGENT_MEMORY_DISABLED', 'Memory tools belong to the root session; report findings to its owner.');
    return this.initialize(agent);
  }
  async refreshAll(): Promise<string[]> {
    const failures: string[] = [];
    for (const agent of this.ctx.agents.list()) {
      const state = this.states.get(agent.session.id);
      if (!state) continue;
      try { await this.refresh(agent, state); }
      catch (error) { this.failed(agent.session.id, state, error); failures.push(`${agent.session.id}: ${state.error}`); }
    }
    return failures;
  }
  async requireAgent(agent?: Agent): Promise<{ agent: Agent; state: AgentState }> {
    if (!agent) throw new MemoryError('NO_AGENT', 'Memory tools require an agent session.');
    return { agent, state: await this.ready(agent) };
  }
  private schedule(agent: Agent, state: AgentState, turn: number, boundary: number): void {
    if (!this.config.autoExtract || (!this.config.enableInHeadless && headless())) return;
    const route = agent.session.requestHeader();
    this.scheduler.schedule({ session: agent.session.id, turn, boundary, project: state.project,
      messages: [...state.messages], observedAt: new Date().toISOString(),
      provider: this.config.extractionProvider || route?.config.provider || agent.options.provider,
      model: this.config.extractionModel || route?.config.model || agent.options.model });
  }
  install(): void {
    const ctx = this.ctx;
    ctx.systemPrompt.section({ name: 'md-memory-policy', order: 850, interpolate: false,
      text: c => c.agent && rootAgent(c.agent) ? MEMORY_POLICY : '' });
    ctx.systemPrompt.context({ name: 'md-memory-index', order: 850, text: c => this.context(c, 'index') });
    ctx.systemPrompt.context({ name: 'md-memory-bodies', order: 851, text: c => this.context(c, 'body') });
    ctx.on('agent/created', async ({ agent }) => { if (rootAgent(agent)) await this.initialize(agent); });
    ctx.on('agent/disposed', ({ agent }) => { this.states.delete(agent.session.id); });
    ctx.on('agent/pre-step', async (payload, next) => {
      if (!rootAgent(payload.agent)) return next();
      const state = await this.initialize(payload.agent);
      const current = payload.messages.filter(m => m.source.kind === 'user').map(text).filter(Boolean).join('\n');
      if (current) {
        if (state.query.current) state.query.recent = [...state.query.recent, state.query.current].slice(-2);
        state.query.current = current;
      }
      state.turn = payload.turn;
      try { payload.signal.throwIfAborted(); await this.refresh(payload.agent, state); }
      catch (error) { this.failed(payload.agent.session.id, state, error); }
      return next();
    });
    ctx.on('session/event', (session: Session, event) => {
      const state = this.states.get(session.id);
      const agent = ctx.agents.get(session.id);
      if (!state || !agent || !rootAgent(agent)) return;
      if (event.type === 'user/message' && event.data.source.kind === 'user') {
        state.messages.push({ id: event.data.id, seq: event.seq, role: 'user', text: text(event.data) });
      } else if (event.type === 'assistant/message' && !event.data.interrupted) {
        state.messages.push({ id: event.data.message.id, seq: event.seq, role: 'assistant', text: text(event.data.message) });
      } else if (event.type === 'turn/end' && event.data.reason.kind === 'completed') {
        // Derive active messages after replacements: compaction never feeds old synthetic context back into extraction.
        const active = new Set(session.deriveMessages().map(m => m.id));
        state.messages = state.messages.filter(m => active.has(m.id as Message['id']));
        this.schedule(agent, state, event.data.turn, event.seq);
      }
    });
    ctx.on('tools/result', (exec, result) => {
      if (!exec.agent || result.isError || exec.name.startsWith('md_memory_')) return;
      const state = this.states.get(exec.agent.session.id);
      if (!state || !exec.arguments || typeof exec.arguments !== 'object') return;
      const args = exec.arguments as Record<string, unknown>;
      const paths = ['file_path', 'path', 'filePath'].map(key => args[key]).filter((v): v is string => typeof v === 'string')
        .map(path => state.project ? relative(state.project.cwd, resolve(state.project.cwd, path)).replace(/\\/g, '/') : path);
      state.query.touchedPaths = [...new Set([...paths, ...state.query.touchedPaths])].slice(0, 12);
    });
    this.tools();
    ctx.effect(() => async () => { await this.scheduler.stop(); await this.logger.flush(); });
    this.logger.info({ event: 'plugin.started', root: this.store.root, indexBytes: this.config.indexBytes, bodyBytes: this.config.bodyBytes,
      autoExtract: this.config.autoExtract, autoRecall: this.config.autoRecall, headless: headless() });
  }
  private tools(): void {
    const ctx = this.ctx;
    const register = (definition: ToolDefinition) => ctx.tools.register({ ...definition,
      execute: async (args, exec) => {
        try { return await definition.execute(args, exec); }
        catch (error) {
          this.logger.error({ event: 'tool.failed', session: exec.agent?.session.id, tool: definition.name }, error);
          if (error instanceof MemoryError) throw new HarnessError(error.message, error.code, { cause: error });
          throw error;
        }
      } });
    register(defineTool({ name: 'md_memory_search', description: '检索本会话可读的每个记忆块（当前项目、被授权的项目，以及授权时的用户作用域），包括未出现在注入索引里的条目。新建条目前先调用它，确认是否已有条目覆盖同一主题；依赖细节前先读命中条目。',
      parameters: { query: { type: 'string', required: true }, limit: { type: 'integer' } }, output,
      execute: async (args, exec) => {
        const { agent, state } = await this.requireAgent(exec.agent);
        exec.signal.throwIfAborted(); await this.refresh(agent, state);
        const limit = args.limit ?? 10;
        if (limit < 1 || limit > 100) throw new MemoryError('INVALID_LIMIT', 'limit must be 1..100.');
        const candidates = state.snapshot.memories.filter(memory => this.visible(state, memory, false));
        const ranked = rankMemories(candidates, { current: args.query, recent: [], touchedPaths: [] },
          { ownSourceKey: state.project?.id, handles: state.handles }).filter(m => m.score > 0);
        this.logger.info({ event: 'memory.search', session: agent.session.id, matches: ranked.length });
        return { total: ranked.length, entries: ranked.slice(0, limit).map(r => ({ scope: r.memory.scope, name: r.memory.name, title: r.memory.title, description: r.memory.description, score: r.score, project: this.projectInfo(state, r.memory) })) };
      } }));
    register(defineTool({ name: 'md_memory_read', description: '读取一条记忆的完整内容。只有读取授权项目中形如 project/<handle>/<name>.md 的条目时才传 project。返回的 revision 与 hash 是更新它时必需的。', parameters: { scope, name, project: projectRef }, output,
      execute: async (args, exec) => {
        const { state } = await this.requireAgent(exec.agent); exec.signal.throwIfAborted();
        if (args.scope === 'user' && args.project !== undefined) throw new MemoryError('INVALID_INPUT', 'The user scope has no project.');
        const target = args.scope === 'user' ? undefined : this.readTarget(state, args.project);
        const m = await this.store.read(args.scope, args.name, target);
        return { scope: m.scope, name: m.name, title: m.title, description: m.description, type: m.type, body: m.body, tags: m.tags, aliases: m.aliases, paths: m.paths, revision: m.revision, hash: m.hash, source: { ...m.source } };
      } }));
    register(defineTool({ name: 'md_memory_write', description: '立即提交一条长期记忆。先检索并读取所有覆盖同一主题的条目：只要存在（哪怕只是部分覆盖、哪怕已经过时）就更新它，不要另建平行条目；只有没有任何条目覆盖该主题时才新建。更新已有条目必须提供当前的 expectedRevision 与 expectedHash。',
      parameters: { scope, name, title: { type: 'string', required: true }, description: { type: 'string', required: true },
        type: { type: 'string', enum: ['user', 'feedback', 'project', 'reference'], required: true }, body: { type: 'string', required: true },
        tags: { type: 'array', items: { type: 'string' } }, aliases: { type: 'array', items: { type: 'string' } }, paths: { type: 'array', items: { type: 'string' } },
        expectedRevision: { type: 'integer' }, expectedHash: { type: 'string' }, userRequested: { type: 'boolean', description: '仅在用户明确要求保存时为 true；重新记住一条已被忘记的条目时同样必需。' } }, output,
      execute: async (args, exec) => {
        const { agent, state } = await this.requireAgent(exec.agent);
        this.assertLocalScope(args);
        const { userRequested, ...input } = args;
        const m = await this.store.write({ ...input, source: { session: agent.session.id, turn: state.turn, kind: userRequested ? 'explicit-user' : 'agent' } }, state.project, exec.signal);
        let contextWarning: string | null = null;
        try { await this.refresh(agent, state); }
        catch (error) { this.failed(agent.session.id, state, error); contextWarning = state.error!; }
        return { committed: true, scope: m.scope, name: m.name, revision: m.revision, hash: m.hash, contextWarning };
      } }));
    register(defineTool({ name: 'md_memory_forget', description: '仅在用户明确要求时忘记一条记忆。删除正文与修订历史，留下不含原文的墓碑。', parameters: { scope, name, userRequested: { type: 'boolean', const: true, required: true } }, output,
      execute: async (args, exec) => {
        const { agent, state } = await this.requireAgent(exec.agent);
        this.assertLocalScope(args);
        await this.store.forget(args.scope, args.name, state.project, exec.signal);
        let contextWarning: string | null = null;
        try { await this.refresh(agent, state); }
        catch (error) { this.failed(agent.session.id, state, error); contextWarning = state.error!; }
        return { committed: true, scope: args.scope, name: args.name, contextWarning };
      } }));
    register(defineTool({ name: 'md_memory_list', description: '列出可读条目及其描述，不含正文。可选 project 限定到某个被授权项目；可选 scope 限定到用户作用域或项目作用域。', parameters: { scope: { type: 'string', enum: ['user', 'project'] }, project: projectRef }, output,
      execute: async (args, exec) => {
        const { agent, state } = await this.requireAgent(exec.agent); exec.signal.throwIfAborted(); await this.refresh(agent, state);
        const target = args.project === undefined ? undefined : this.readTarget(state, args.project);
        return { entries: state.snapshot.memories
          .filter(memory => this.visible(state, memory, false))
          .filter(memory => target === undefined || memory.sourceKey === target.id)
          .filter(memory => !args.scope || memory.scope === args.scope)
          .map(memory => ({ scope: memory.scope, name: memory.name, title: memory.title, description: memory.description, revision: memory.revision, project: this.projectInfo(state, memory) })) };
      } }));
    register(defineTool({ name: 'md_memory_status', description: '查看工作区绑定、可读记忆块、预算、无效文件、后台提取与错误。', parameters: {}, output,
      execute: async (_args, exec) => {
        const { agent, state } = await this.requireAgent(exec.agent); exec.signal.throwIfAborted();
        const visibleSources: VisibleSource[] = [];
        if (state.access ? state.access.user : true) visibleSources.push({ id: USER_SOURCE, label: '用户记忆', kind: 'user' });
        if (state.project) visibleSources.push({ id: state.project.id, label: state.handles[state.project.id] ?? state.project.id, kind: 'own' });
        for (const granted of state.access?.granted ?? []) visibleSources.push({ id: granted.id, label: state.handles[granted.id] ?? granted.id, kind: 'granted' });
        return { root: this.store.root, project: state.project ? { ...state.project } : null, visibleSources, index: state.index ? { ...state.index } : null,
          diagnostics: state.snapshot.diagnostics.map(d => ({ ...d })), contextError: state.error ?? null, extraction: { ...this.scheduler.status(agent.session.id) },
          autoExtract: this.config.autoExtract && (this.config.enableInHeadless || !headless()), autoRecall: this.config.autoRecall };
      } }));
  }
  /** Grants are read-only: no tool may target another project for writing. */
  private assertLocalScope(args: Record<string, unknown>): void {
    for (const key of ['project', 'projectId']) {
      if (key in args && args[key] !== undefined) {
        throw new MemoryError('INVALID_INPUT', 'Cross-project access is read-only: md_memory_write and md_memory_forget always target the current project.');
      }
    }
  }
}
