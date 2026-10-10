import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readdir, writeFile } from 'node:fs/promises';
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
    this.count++;
    if (this.count === 1) yield* tool('md_memory_write', input);
    else yield* response('已记录。');
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
  await agent.whenIdle();
  const entries = (await execute(ctx, agent, 'md_memory_list', {})).entries;
  assert.equal(entries.length, 1, 'only the agent tool call writes memory');
  const restoreNative = agent.ctx.tools.presentAs('ptc');
  const ptc = await execute(ctx, agent, 'run_code', { code: 'return await tools.md_memory_list({})', description: 'List stored memories' });
  assert.equal(ptc.result.entries.length, 1, 'PTC sees canonical object values, not native rendered strings');
  restoreNative();
  assert(calls.length >= 2, 'the turn itself makes the only model calls');
  assert(JSON.stringify(calls[0].messages).includes('一条主题一条目'));
  assert(JSON.stringify(calls[1].messages).includes('manual-rule.md'), 'next step refreshes memory context after tool commit');
  const found = await execute(ctx, agent, 'md_memory_search', { query: 'Markdown' });
  assert(found.entries.some(e => e.name === 'manual-rule'));
  const read = await execute(ctx, agent, 'md_memory_read', { scope: 'project', name: 'manual-rule' });
  assert.equal(read.revision, 1);
  await execute(ctx, agent, 'md_memory_write', { ...input, body: '更新：仅 Markdown 文件持久化。', expectedRevision: read.revision, expectedHash: read.hash });
  await execute(ctx, agent, 'md_memory_write', { scope: 'project', name: 'link-owner', title: '带互链的条目', description: '验证 [[name]] 的解析结果', type: 'project', body: '见 [[manual-rule]]，以及一条已经不存在的 [[ghost-entry]]。' });
  const linked = await execute(ctx, agent, 'md_memory_read', { scope: 'project', name: 'link-owner' });
  assert.deepEqual(linked.related.map(link => [link.name, link.exists]), [['manual-rule', true], ['ghost-entry', false]], 'read resolves the [[name]] links of the body');
  assert.equal(linked.related[0].scope, 'project');
  assert.equal(typeof linked.related[0].project, 'string', 'a live link names the block its target lives in');
  assert.equal(linked.related[0].description.includes('持久化'), true, 'a live link carries a short description hint');
  assert.equal(linked.related[1].project, undefined, 'a dead link carries no block');
  assert.equal(linked.omitted, 0);
  await execute(ctx, agent, 'md_memory_forget', { scope: 'project', name: 'link-owner', userRequested: true });
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
  assert.equal((await execute(ctx, agent, 'md_memory_list', {})).entries.length, 0, 'nothing writes memory behind the agent');
  const workspaceId = (await execute(ctx, agent, 'md_memory_status', {})).project.id;
  const child = await ctx.agents.create({ sessionId: SessionId('host-child'), parentAgent: agent, meta: { cwd: root, origin: 'subagent', delegationDepth: 1 }, agentOptions: { provider: 'mock', model: 'mock' } });
  const childRead = await ctx.tools.execute({ callId: ToolCallId('child-read'), name: 'md_memory_list', arguments: {}, agent: child.agent, signal: new AbortController().signal });
  assert.equal(childRead.isError, true, 'subagents never get the memory tools');
  await child.dispose();
  const observation = await ctx.sessionQuery.observeSession(agent.session.id, { projectionMode: 'none' });
  const seed = [...observation.events]; observation[Symbol.dispose]();
  await handle.dispose();
  const beforeResume = calls.length;
  const resumed = await ctx.agents.create({ sessionId: SessionId('host-root'), seed, meta: { cwd: root }, agentOptions: { provider: 'mock', model: 'mock' } });
  assert.equal(calls.length, beforeResume, 'resuming a session never calls a model on its own');
  assert.equal((await execute(ctx, resumed.agent, 'md_memory_list', {})).entries.length, 0, 'the resumed session keeps its workspace binding');
  await resumed.dispose();
  const fork = await ctx.agents.create({ sessionId: SessionId('host-fork'), seed, inheritedEventCount: seed.length,
    meta: { cwd: root, parentSession: SessionId('host-root'), isSeeded: true }, agentOptions: { provider: 'mock', model: 'mock' } });
  fork.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'fork 新决定：继续使用 Markdown。' }], source: { kind: 'user' } }));
  await fork.agent.whenIdle();
  assert.equal(calls.length, beforeResume + 1, 'a forked turn makes exactly one model call and no background call');
  assert(JSON.stringify(calls.at(-1)).includes('fork 新决定'), 'the fork sees its own new input');
  await fork.dispose();
  const disabled = await harness({ autoRecall: false });
  const second = await disabled.ctx.agents.create({ sessionId: SessionId('host-next'), meta: { cwd: root }, agentOptions: { provider: 'mock', model: 'mock' } });
  assert.equal((await execute(disabled.ctx, second.agent, 'md_memory_status', {})).project.id, workspaceId, 'new session discovers same workspace memory');
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
  // Clearing a whole project through the real management route: project only, confirmed.
  const resetTarget = { id: 'reset-target-0000000000000000', cwd: join(root, 'reset-workspace'), root: join(root, 'reset-workspace'), kind: 'directory' };
  await ctx.mdMemory.store.initializeProject(resetTarget);
  await ctx.mdMemory.store.write({ ...input, name: 'reset-rule', scope: 'project', body: '将被清空的正文。', source: { kind: 'explicit-user', session: 'harness', turn: 0 } }, resetTarget);
  // A `state/` file written by a version up to 0.6.0 is wiped like any other artifact.
  await mkdir(join(ctx.mdMemory.store.directory('project', resetTarget), 'state'), { recursive: true });
  await writeFile(join(ctx.mdMemory.store.directory('project', resetTarget), 'state', 'legacy.md'), '---\nboundary: 7\n---\n');
  const resetRoute = body => api.fetch(new Request('http://localhost/api/md-memory/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const unconfirmed = await resetRoute({ scope: 'project', projectId: resetTarget.id });
  assert.equal(unconfirmed.status, 400, 'a project wipe needs the page confirmation');
  assert.equal((await unconfirmed.json()).code, 'CONFIRMATION_REQUIRED');
  const userWipe = await resetRoute({ scope: 'user', confirm: true });
  assert.equal(userWipe.status, 400, 'the shared user scope is never a wipe target');
  assert.equal((await userWipe.json()).code, 'USER_SCOPE_PROTECTED');
  const resetResponse = await resetRoute({ scope: 'project', projectId: resetTarget.id, confirm: true });
  assert.equal(resetResponse.status, 200, await resetResponse.clone().text());
  assert.equal((await resetResponse.json()).removed, 1, 'the wipe reports how many entries it deleted');
  assert.equal((await ctx.mdMemory.store.snapshot(resetTarget)).memories.filter(memory => memory.scope === 'project').length, 0, 'the wiped project reads back empty');
  await assert.rejects(readdir(join(ctx.mdMemory.store.directory('project', resetTarget), 'state')), { code: 'ENOENT' }, 'the wipe drops legacy state files');
  const groupsAfterReset = await (await api.fetch(new Request('http://localhost/api/md-memory/groups'))).json();
  assert.equal(groupsAfterReset.find(group => group.id === resetTarget.id).entries.length, 0, 'the management page lists the wiped project as empty');
  assert.equal((await ctx.mdMemory.store.project(resetTarget.id)).cwd, resetTarget.cwd, 'PROJECT.md keeps the project identity');
  // Explicit user-scope denial must also cover direct reads of a known name,
  // including revocation between tool calls without a prior refresh.
  const hidden = await ctx.mdMemory.store.write({ ...input, scope: 'user', name: 'hidden-user-rule', body: 'USER_PRIVATE_SENTINEL',
    source: { kind: 'explicit-user', session: 'harness', turn: 0 } });
  await execute(ctx, crossAgent, 'md_memory_read', { scope: 'user', name: hidden.name });
  const previousSources = ctx.mdMemory.config.crossProject[ownProjectId];
  ctx.mdMemory.config.crossProject[ownProjectId] = [];
  const deniedUser = await ctx.tools.execute({ callId: ToolCallId('user-denied'), name: 'md_memory_read',
    arguments: { scope: 'user', name: hidden.name }, agent: crossAgent, signal: new AbortController().signal });
  assert.equal(deniedUser.isError, true, 'a direct read rechecks revoked user-scope access');
  assert(JSON.stringify(deniedUser).includes('SOURCE_NOT_VISIBLE'));
  assert.equal((await execute(ctx, crossAgent, 'md_memory_list', { scope: 'user' })).entries.length, 0);
  assert.equal((await execute(ctx, crossAgent, 'md_memory_search', { query: 'USER_PRIVATE_SENTINEL' })).entries.length, 0);
  ctx.mdMemory.config.crossProject[ownProjectId] = previousSources;
  await ctx.mdMemory.store.forget('user', hidden.name);

  // Check the actual first model request, not only the post-step runtime state.
  const recallProject = await ctx.mdMemory.store.project(ownProjectId);
  const seedRecall = (name, word, body) => ctx.mdMemory.store.write({ ...input, name, title: word, description: word, body,
    source: { kind: 'explicit-user', session: 'harness', turn: 0 } }, recallProject);
  await seedRecall('first-recall-rule', 'ZXQNEEDLE', 'FIRST_RECALL_BODY_SENTINEL');
  await seedRecall('second-recall-rule', 'PQRNEWQUERY', 'SECOND_RECALL_BODY_SENTINEL');
  const recallHandle = await ctx.agents.create({ sessionId: SessionId('host-first-recall'), meta: { cwd: root }, agentOptions: { provider: 'mock', model: 'mock' } });
  for (const [query, sentinel] of [['ZXQNEEDLE', 'FIRST_RECALL_BODY_SENTINEL'], ['PQRNEWQUERY', 'SECOND_RECALL_BODY_SENTINEL']]) {
    const start = calls.length;
    recallHandle.agent.followup(createUserMessage({ content: [{ type: 'text', text: query }], source: { kind: 'user' } }));
    await recallHandle.agent.whenIdle();
    assert(JSON.stringify(calls[start]).includes(sentinel), `the first model request for ${query} includes its recalled body`);
  }
  await recallHandle.dispose();
  await cross.dispose();
  await ctx.mdMemory.logger.flush(); await disabled.ctx.mdMemory.logger.flush();
  const files = await readdir(join(root, 'memories'), { recursive: true, withFileTypes: true });
  assert(files.filter(f => f.isFile()).every(f => f.name.endsWith('.md')));
  console.log('DSH host contract passed: plugin load, Native/PTC tools, context refresh, conflicts, forget, memory moves, project wipe, child isolation, resume/fork, workspace binding and cross-project grants.');
} finally {
  for (const ctx of contexts.reverse()) await ctx.fiber.dispose();
  await rm(root, { recursive: true, force: true });
}
