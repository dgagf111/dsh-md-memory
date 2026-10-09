import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Context } from '@deepseek-ai/cordis';
import LlmRuntime, { LlmAdapter, createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm';
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session';
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import AgentRegistry from '@deepseek-ai/dsh-agent';
import AgentLoop from '@deepseek-ai/dsh-agent-loop';
import SessionQueryEngine from '@deepseek-ai/dsh-session-query';
import { PtcRuntime } from '@deepseek-ai/dsh-ptc-runtime';
import { HostConnectionService } from '@deepseek-ai/dsh-client-connection';

const plugin = await import(new URL(process.argv[2] ?? '../lib/index.js', import.meta.url).href);
const root = await mkdtemp(join(tmpdir(), 'md-memory-host-'));
const contexts = [];
const calls = [];
const extractionInputs = [];
const input = { scope: 'project', name: 'manual-rule', title: 'Markdown 存储', description: '选择项目持久化格式时参考', type: 'project', body: '本项目只使用 Markdown 存储。' };
function response(text) { return [
  { type: 'block-start', index: 0, blockType: 'text' }, { type: 'text-delta', index: 0, text },
  { type: 'block-end', index: 0, block: { type: 'text', text } }, { type: 'finish', reason: { kind: 'stop' } },
]; }
function tool(name, args) {
  const id = ToolCallId('write-one'); const argumentsJson = JSON.stringify(args);
  return [{ type: 'block-start', index: 0, blockType: 'tool-call' }, { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: argumentsJson },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: argumentsJson } }, { type: 'finish', reason: { kind: 'tool-calls' } }];
}
class Adapter extends LlmAdapter {
  count = 0;
  async resolveModel(provider, model) { return { provider, id: model, name: model }; }
  async * stream(options) {
    calls.push(options);
    if (options.system?.startsWith('You are a background memory extraction task')) {
      assert.equal(options.tools, undefined, 'background extraction has no tools');
      const data = JSON.parse(options.messages[0].content[0].text);
      extractionInputs.push(data);
      assert(data.newMessages.some(m => m.role === 'user' && m.text.includes('Markdown')));
      yield* response(JSON.stringify({ operations: data.existingMemories.some(m => m.name === 'extracted-rule') ? [] : [{ ...input, name: 'extracted-rule', title: '正文按需召回', description: '构建上下文时参考', body: '正文按需召回，索引预算足够时完整注入。', action: 'write' }] }));
    } else {
      this.count++;
      if (this.count === 1) yield* tool('md_memory_write', input);
      else yield* response('已记录。');
    }
  }
}
class LiveQuery extends SessionQueryEngine {
  async searchSessions() { throw new Error('search not used in this contract test'); }
  async searchEvents() { throw new Error('search not used in this contract test'); }
}
// Test backend only: exercise DSH's real run_code dispatch bridge, not the OS sandbox.
class ContractPtc extends PtcRuntime {
  language = 'typescript'; isolation = 'test';
  resolve(request) { return { ...request, cwd: request.cwd ?? root, timeoutMs: 1000 }; }
  async run(spec) {
    assert.equal(spec.program, 'return await tools.md_memory_list({})');
    const value = await spec.bindings.find(b => b.global === 'tools').functions.md_memory_list({});
    return { logs: [], value };
  }
}
async function harness(config = {}) {
  const ctx = new Context(); contexts.push(ctx);
  await ctx.plugin(LlmRuntime); await ctx.plugin(SessionStore); await ctx.plugin(SessionProjectionRegistry);
  await ctx.plugin(SystemPrompt); await ctx.plugin(ContractPtc); await ctx.plugin(ToolRuntime); await ctx.plugin(AgentRegistry); await ctx.plugin(LiveQuery);
  await ctx.plugin(AgentLoop, { agents: [] });
  ctx.llm.registerAdapter(['mock'], new Adapter());
  const connection = new HostConnectionService(ctx, [], {});
  await ctx.plugin(plugin, { memoryDir: join(root, 'memories'), debug: true, ...config });
  for (const runtime of ctx.registry.values()) for (const fiber of runtime.fibers) await fiber.await();
  assert(ctx.mdMemory, 'named Cordis plugin loads with Config and inject exports');
  const api = connection.createSharedFetchHandler('/api');
  const settings = await api.fetch(new Request('http://localhost/api/md-memory/settings'));
  assert.equal(settings.status, 200, 'management routes survive real DSH exact-path registration');
  const saved = await settings.json();
  const update = await api.fetch(new Request('http://localhost/api/md-memory/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ values: saved.values, hash: saved.hash }) }));
  assert.equal(update.status, 200, 'GET and POST settings share one registered path');
  assert.equal((await api.fetch(new Request('http://localhost/api/md-memory/groups'))).status, 200);
  return { ctx, api };
}
async function execute(ctx, agent, name, args) {
  const result = await ctx.tools.execute({ callId: ToolCallId(`call-${name}`), name, arguments: args, agent, signal: new AbortController().signal });
  assert.equal(result.isError, false, JSON.stringify(result)); return result.value;
}
try {
  const { ctx, api } = await harness();
  const handle = await ctx.agents.create({ sessionId: SessionId('host-root'), meta: { cwd: root }, agentOptions: { provider: 'mock', model: 'mock' } });
  const agent = handle.agent;
  agent.followup(createUserMessage({ content: [{ type: 'text', text: '请记住，本项目使用 Markdown；正文按需召回。' }], source: { kind: 'user' } }));
  await agent.whenIdle(); await ctx.mdMemory.scheduler.drain();
  assert.equal((await execute(ctx, agent, 'md_memory_status', {})).extraction.state, 'completed');
  const entries = (await execute(ctx, agent, 'md_memory_list', {})).entries;
  assert.equal(entries.length, 2, 'main-agent tool write plus independent background write');
  const restoreNative = agent.ctx.tools.presentAs('ptc');
  const ptc = await execute(ctx, agent, 'run_code', { code: 'return await tools.md_memory_list({})', description: 'List stored memories' });
  assert.equal(ptc.result.entries.length, 2, 'PTC sees canonical object values, not native rendered strings');
  restoreNative();
  const mainCalls = calls.filter(c => !c.system?.startsWith('You are a background'));
  assert(mainCalls.length >= 2);
  assert(JSON.stringify(mainCalls[0].messages).includes('Before writing a new entry'));
  assert(JSON.stringify(mainCalls[1].messages).includes('manual-rule.md'), 'next step refreshes memory context after tool commit');
  const found = await execute(ctx, agent, 'md_memory_search', { query: 'Markdown' });
  assert(found.entries.some(e => e.name === 'manual-rule'));
  const read = await execute(ctx, agent, 'md_memory_read', { scope: 'project', name: 'manual-rule' });
  assert.equal(read.revision, 1);
  await execute(ctx, agent, 'md_memory_write', { ...input, body: '更新：仅 Markdown 文件持久化。', expectedRevision: read.revision, expectedHash: read.hash });
  const originalRefresh = ctx.mdMemory.refresh;
  ctx.mdMemory.refresh = async () => { throw new Error('simulated context refresh failure'); };
  const savedWithWarning = await execute(ctx, agent, 'md_memory_write', { ...input, name: 'refresh-warning-rule' });
  assert.equal(savedWithWarning.committed, true, 'refresh failure cannot turn a committed write into a failed save');
  assert(savedWithWarning.contextWarning.includes('refresh failure'));
  ctx.mdMemory.refresh = originalRefresh;
  await execute(ctx, agent, 'md_memory_forget', { scope: 'project', name: 'refresh-warning-rule', userRequested: true });
  const rejected = await ctx.tools.execute({ callId: ToolCallId('stale'), name: 'md_memory_write', arguments: input, agent, signal: new AbortController().signal });
  assert.equal(rejected.isError, true, 'revision conflicts surface through host tools');
  assert(JSON.stringify(rejected).includes('REVISION_CONFLICT') || JSON.stringify(rejected).includes('current revision'));
  await execute(ctx, agent, 'md_memory_forget', { scope: 'project', name: 'manual-rule', userRequested: true });
  assert.equal((await execute(ctx, agent, 'md_memory_list', {})).entries.length, 1);
  const child = await ctx.agents.create({ sessionId: SessionId('host-child'), parentAgent: agent, meta: { cwd: root, origin: 'subagent', delegationDepth: 1 }, agentOptions: { provider: 'mock', model: 'mock' } });
  const childRead = await ctx.tools.execute({ callId: ToolCallId('child-read'), name: 'md_memory_list', arguments: {}, agent: child.agent, signal: new AbortController().signal });
  assert.equal(childRead.isError, true, 'subagents do not write or extract root memory');
  await child.dispose();
  const observation = await ctx.sessionQuery.observeSession(agent.session.id, { projectionMode: 'none' });
  const seed = [...observation.events]; observation[Symbol.dispose]();
  await handle.dispose();
  const beforeResume = extractionInputs.length;
  const resumed = await ctx.agents.create({ sessionId: SessionId('host-root'), seed, meta: { cwd: root }, agentOptions: { provider: 'mock', model: 'mock' } });
  await ctx.mdMemory.scheduler.drain();
  assert.equal(extractionInputs.length, beforeResume, 'checkpoint prevents repeat extraction after resume');
  await resumed.dispose();
  const fork = await ctx.agents.create({ sessionId: SessionId('host-fork'), seed, inheritedEventCount: seed.length,
    meta: { cwd: root, parentSession: SessionId('host-root'), isSeeded: true }, agentOptions: { provider: 'mock', model: 'mock' } });
  fork.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'fork 新决定：继续使用 Markdown。' }], source: { kind: 'user' } }));
  await fork.agent.whenIdle(); await ctx.mdMemory.scheduler.drain();
  const lastInput = extractionInputs.at(-1);
  assert.equal(lastInput.newMessages.filter(m => m.role === 'user').length, 1, 'fork extraction excludes inherited parent user messages');
  assert(lastInput.newMessages[0].text.includes('fork'));
  await fork.dispose();
  const disabled = await harness({ autoExtract: false, autoRecall: false });
  const second = await disabled.ctx.agents.create({ sessionId: SessionId('host-next'), meta: { cwd: root }, agentOptions: { provider: 'mock', model: 'mock' } });
  assert.equal((await execute(disabled.ctx, second.agent, 'md_memory_list', {})).entries.length, 1, 'new session discovers same workspace memory');
  await second.dispose();
  // Cross-project reads: opt-in per project, read-only, and reported to the model.
  const otherDir = join(root, 'other-workspace');
  await mkdir(otherDir, { recursive: true });
  const other = { id: 'other-workspace-0000000000000000', cwd: otherDir, root: otherDir, kind: 'directory' };
  await ctx.mdMemory.store.initializeProject(other);
  await ctx.mdMemory.store.write({ scope: 'project', name: 'other-rule', title: '邻项目约定', description: '另一个工作区的约定', type: 'project',
    body: '邻项目同样只使用 Markdown。', tags: [], aliases: [], paths: [], source: { session: 'harness', turn: 0, kind: 'explicit-user' } }, other);
  const cross = await ctx.agents.create({ sessionId: SessionId('host-cross'), meta: { cwd: root }, agentOptions: { provider: 'mock', model: 'mock' } });
  const crossAgent = cross.agent;
  const denied = await ctx.tools.execute({ callId: ToolCallId('cross-denied'), name: 'md_memory_read',
    arguments: { scope: 'project', name: 'other-rule', project: 'other-workspace' }, agent: crossAgent, signal: new AbortController().signal });
  assert.equal(denied.isError, true, 'an ungranted project must not be readable');
  assert(JSON.stringify(denied).includes('granted') || JSON.stringify(denied).includes('PROJECT_NOT_VISIBLE'));
  const ownProjectId = (await execute(ctx, crossAgent, 'md_memory_status', {})).project.id;
  const settingsBefore = await (await api.fetch(new Request('http://localhost/api/md-memory/settings'))).json();
  const granted = await api.fetch(new Request('http://localhost/api/md-memory/settings', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ values: { ...settingsBefore.values, crossProject: { [ownProjectId]: ['user', other.id] } }, hash: settingsBefore.hash }) }));
  assert.equal(granted.status, 200, await granted.clone().text());
  const grantedBody = await granted.json();
  assert.deepEqual(grantedBody.values.crossProject, { [ownProjectId]: ['user', other.id] }, 'settings round-trip keeps the grant');
  assert.deepEqual(grantedBody.stale, []);
  assert.deepEqual(grantedBody.warnings, [], 'a live session re-reads its blocks after the save');
  const status = await execute(ctx, crossAgent, 'md_memory_status', {});
  assert(status.visibleSources.some(source => source.kind === 'granted' && source.id === other.id), 'status lists the granted block');
  const crossRead = await execute(ctx, crossAgent, 'md_memory_read', { scope: 'project', name: 'other-rule', project: 'other-workspace' });
  assert.equal(crossRead.title, '邻项目约定');
  assert((await execute(ctx, crossAgent, 'md_memory_list', {})).entries.some(entry => entry.project?.id === other.id), 'list spans the granted project');
  assert((await execute(ctx, crossAgent, 'md_memory_search', { query: '邻项目' })).entries.some(entry => entry.project?.id === other.id), 'search spans the granted project');
  const crossWrite = await ctx.tools.execute({ callId: ToolCallId('cross-write'), name: 'md_memory_write',
    arguments: { ...input, name: 'cross-write-attempt', project: other.id }, agent: crossAgent, signal: new AbortController().signal });
  assert.equal((await ctx.mdMemory.store.snapshot(other)).memories.length, 1, 'a grant never becomes a write target');
  if (!crossWrite.isError) {
    const own = await ctx.mdMemory.store.snapshot(await ctx.mdMemory.store.project(ownProjectId));
    assert(own.memories.some(memory => memory.name === 'cross-write-attempt'), 'a write still lands in the current project');
    await ctx.mdMemory.store.forget('project', 'cross-write-attempt', await ctx.mdMemory.store.project(ownProjectId));
  }
  // Moving memories through the real management route: any scope can move to any other scope.
  const moveRoute = body => api.fetch(new Request('http://localhost/api/md-memory/move', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const written = await (await api.fetch(new Request('http://localhost/api/md-memory/write', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...input, name: 'move-me-rule', scope: 'user' }) }))).json();
  const movedResponse = await moveRoute({ scope: 'user', name: 'move-me-rule', revision: written.memory.revision, hash: written.memory.hash, toScope: 'project', toProjectId: ownProjectId });
  assert.equal(movedResponse.status, 200, await movedResponse.clone().text());
  const movedMemory = (await movedResponse.json()).memory;
  assert.equal(movedMemory.scope, 'project', 'a user memory lands in the target project');
  assert.equal((await ctx.mdMemory.store.read('project', 'move-me-rule', await ctx.mdMemory.store.project(ownProjectId))).body, input.body, 'the moved file keeps its body');
  const staleMove = await moveRoute({ scope: 'project', projectId: ownProjectId, name: 'move-me-rule', revision: 1, hash: 'stale', toScope: 'user' });
  assert.equal(staleMove.status, 409, 'a stale move is refused');
  assert.equal((await staleMove.json()).code, 'REVISION_CONFLICT');
  const sameMove = await moveRoute({ scope: 'project', projectId: ownProjectId, name: 'move-me-rule', revision: movedMemory.revision, hash: movedMemory.hash, toScope: 'project', toProjectId: ownProjectId });
  assert.equal(sameMove.status, 400, 'moving inside one scope is rejected');
  assert.equal((await sameMove.json()).code, 'SAME_TARGET');
  const movedBack = await moveRoute({ scope: 'project', projectId: ownProjectId, name: 'move-me-rule', revision: movedMemory.revision, hash: movedMemory.hash, toScope: 'user' });
  assert.equal(movedBack.status, 200, await movedBack.clone().text());
  assert.equal((await movedBack.json()).memory.scope, 'user', 'a project memory can move back to the user scope');
  await cross.dispose();
  await ctx.mdMemory.logger.flush(); await disabled.ctx.mdMemory.logger.flush();
  const files = await readdir(join(root, 'memories'), { recursive: true, withFileTypes: true });
  assert(files.filter(f => f.isFile()).every(f => f.name.endsWith('.md')));
  console.log('DSH host contract passed: plugin load, Native/PTC tools, context refresh, background extraction, conflicts, forget, memory moves, child isolation, resume/fork, workspace binding and cross-project grants.');
} finally {
  for (const ctx of contexts.reverse()) await ctx.fiber.dispose();
  await rm(root, { recursive: true, force: true });
}
