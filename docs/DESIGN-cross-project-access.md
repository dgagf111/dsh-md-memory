# 跨项目记忆访问设计（会话内可读的其他项目）

状态：已实施（0.4.0，2026-10-09）。实施中的两处细化见 §4、§6。
目标版本：0.4.0。

## 0. 需求与已定决策

会话内的记忆能力今天只覆盖 `user` + 当前会话项目（`MemoryStore.snapshot` 的范围固定为 `['user','project']`，`md_memory_read` 只有 `scope` + `name`）。本设计让用户在「记忆 → 配置 → 召回 → 跨项目访问」里**逐个项目**授权：某个项目勾选了哪些记忆块，那个项目的会话就能读到这些块。

硬边界：

1. **方向是读者侧（单向）**。项目 A 的卡片决定「在 A 的会话里能读到谁」；A 勾选 B 不等于 B 能读 A，也不改变 B 的卡片。
2. **只读**。授权只开放注入、自动正文召回、`md_memory_search` / `list` / `read`。`md_memory_write` / `forget` 与后台提炼的落盘目标永远是当前项目（`state.project`），不受矩阵影响。
3. **默认最小**。矩阵为空时行为与 0.3.2 一致：每个项目只看得见自己 + user。

已定决策（2026-10-09 确认）：

| # | 决策 | 影响 |
|---|---|---|
| 1 | 授权**只读** | `write` / `forget` 不声明 `project` 参数；提炼候选集不变 |
| 2 | **矩阵是 user 可见性的唯一来源**，删除全局 `recallUser` 开关 | 需要旧键迁移处理（§2.1）、README 与页面文案同步 |
| 3 | 跨项目预算护栏**固定 50% 常量**，不进配置 | 矩阵是唯一新增的持久化字段 |
| 4 | 链接用**短 slug**，slug 冲突时冲突组退化为完整 id | `projectHandle` 纯函数 |
| 5 | 首版**不做**「双向复制」等便捷按钮 | 只有勾选框 + 全部关闭 + 过滤框 |

## 1. 术语与数据模型

- **记忆块（source key）**：`user`，或某个项目的规范键——就是记忆目录名，即 `ProjectIdentity.id`（例：`dsh-workspace-eeeaa25ec03b0a9a`）。
- **授权矩阵 `crossProject`**：`{ [ownProjectId]: string[] }`。值是该项目会话里**完整可见的来源集合**（含 `'user'`），**不含自身**——自身恒可见。矩阵里没有的项目视为 `['user']`。

```yaml
crossProject:
  dsh-md-memory-5f920278238b3781:
    - user
    - dsh-workspace-eeeaa25ec03b0a9a
  dsh-workspace-eeeaa25ec03b0a9a:
    - user
```

上例：`dsh-md-memory` 的会话可见 user + 自身 + `dsh-workspace`；`dsh-workspace` 只可见 user + 自身；`stock-dashboard-v2` 未出现在矩阵里，等价 `['user']`。

这个集合同时决定三件事，不允许出现分叉：

- 注入的短索引与自动正文召回的候选集；
- `md_memory_search` / `md_memory_list` 的检索范围；
- `md_memory_read` 允许的 `project` 取值（越权 → `PROJECT_NOT_VISIBLE`）。

自身项目仍由既有的 `recallProject` 控制（关掉就不注入/不召回自身），矩阵不接管它。

## 2. 存储：写进现有 SETTINGS.md

只有一个新配置项进 `Config`（`src/config.ts`）：

```ts
crossProject: Schema.dict(Schema.array(Schema.string())).default({}),
```

理由：

- 页面只有一个「保存配置」按钮、一个 revision hash。矩阵进同一个文件就是**一次 `atomicMarkdown`、一个乐观锁**，不存在半保存状态。
- 符合 `docs/UI-DESIGN.md` 的既有约束：「配置依旧写入 SETTINGS.md 并即时应用……不增加存储方式」。
- 矩阵变更会改变 `Config` 的 JSON，`management.settings()` / `updateSettings()` 里已有的 `changed → refreshAll()` 逻辑自动让所有活动会话重算上下文，不需要新钩子。

被否掉的方案：

- **每项目一个 `ACCESS.md`**：n 个项目要写 n 个文件，跨文件不原子；读时也要扫全库。
- **全局 `ACCESS.md` + 独立路由**：多一个 hash、多一个保存入口、多一个冲突界面，收益只是「SETTINGS.md 更干净」。
- **`crossProjectShare` 进配置**：决策 3 已定，它是 `retrieval.ts` 里的常量（§4）。

已验证的 schema 行为（`@deepseek-ai/schemastery`）：

- `Schema.dict(Schema.array(Schema.string()))` 可用；`{ "a-1": "user" }` 报错 `$.crossProject.a-1 expected array but got user`，经由现有 `saveSettings` 包装成 `INVALID_SETTINGS`（页面 400）。
- schemastery **保留未知键**：`Schema.object({...})({ nope: 1 })` 的返回值里仍有 `nope`。这条决定了下面的迁移方案。

### 2.1 删除 `recallUser` 的迁移

本机 `~/.dsh/md-memory/SETTINGS.md` 现在就写着 `recallUser: true`（页面写进去的）。如果只从 schema 里删掉字段，链条会这样断：

1. `settingsSnapshot()` 读出 `recallUser: true`；
2. `Config({ ...base, ...saved.values })` 因为**保留未知键**，把它原样带进返回对象；
3. `management.settings()` 把它放进 `values` 交给页面；
4. 页面保存时把整个 `values` 回传，`saveSettings()` 的 `allowed`（由新 schema 推出）不含该键 → 报 `Unknown setting: recallUser`，**页面从此存不了配置**。

所以迁移是设计的一部分，而不是顺手删字段：

- `settings.ts` 新增 `export const LEGACY_SETTINGS = ['recallUser'] as const;`
- `loadSettings()`：先 `stripLegacy(saved.values)` 再 `Config(...)`，该键不再进入 `PluginConfig`。
- `saveSettings()`：入参先 `stripLegacy` 再校验白名单——**静默丢弃，不报错**，这样旧客户端/旧标签页仍能保存。
- 语义种入（一次性）：`recallUser === false` 时，把「矩阵里没有的项目」的默认来源设为 `[]` 而不是 `['user']`，避免升级后 user 记忆静默复活；`true` 或缺省 → `['user']`。种入值由 runtime 的 `legacySources` 字段持有（`loadSettingsWithMigration` 返回，`resolveAccess` 在矩阵缺项时用它），任何一次保存后重置为 `['user']`。
- 第一次保存后键就消失（写盘内容是 `Config` 过 strip 的结果），页面此时已把每个项目的勾选状态写成显式矩阵项，种入值自然被固化。
- 保留自己的 `crossProject` 的降级风险：旧版插件读到含 `crossProject` 的 SETTINGS.md 不会崩，但旧版白名单会拒绝保存（同一个 `Unknown setting`）。降级时手工删掉该键，不做兼容表。

## 3. 解析与生效

新增 `src/access.ts`（纯函数，无 IO）：

```ts
export const DEFAULT_SOURCES = ['user'] as const;
export type AccessMatrix = Record<string, string[]>;
export interface ResolvedAccess {
  own: ProjectIdentity;
  user: boolean;                      // 矩阵说了算：sources.includes('user')
  granted: ProjectIdentity[];         // 已授权且仍然存在的其他项目
  stale: string[];                    // 矩阵里指向不存在项目的键/值
}
export function normalizeMatrix(raw: unknown, known: ProjectIdentity[]): { matrix: AccessMatrix; stale: string[] };
export function resolveAccess(own, known, matrix, legacyDefault: string[]): ResolvedAccess;
export function projectHandle(project, all: ProjectIdentity[]): string;   // 短 slug，冲突退化完整 id
```

- `normalizeMatrix` 丢弃不存在的项目键与来源值并记账，**不报错**：项目目录被删掉后配置仍然可用，页面把 stale 显示为「已忽略」。
- `resolveAccess`：`sources = matrix[own.id] ?? legacyDefault`（`stale` 值先剔除）；`user = sources.includes('user')`；`granted = sources.filter(id => known.has(id))`。**没有全局 user 开关参与**（决策 2）。
- 解析在每次 `refresh()` 时重算（与 `state.snapshot` 同一处），所以保存配置后**下一次模型请求即生效**，与现有 `refreshAll()` 语义一致。

需要在 `store.ts` 补的能力：

- `listProjects(): Promise<ProjectIdentity[]>`——把 `management.ts` 里 `readdir(projects)` + 校验 `PROJECT.md` 的逻辑下沉，management 与 access 共用（现在是 `management.project(id)` 私有实现，复制一份必然漂）。
- `snapshot(project?, includeDisabled?, extra?: ProjectIdentity[])`——按 `['user', own, ...granted]` 依次读取各自的活跃条目。

生效代价：一次 refresh 最多读 1 + 授权数 个项目的全部活跃 `.md`。护栏是「只读被授权的项目」+ 默认授权为空；首版不做 mtime 缓存（见 §8 风险）。

## 4. 召回、预算与身份

候选集 = `user`（矩阵含 `'user'` 时）+ 自身项目（`recallProject`）+ 已授权项目。

- **打分不变**：仍然一条 BM25F 管线（`retrieval.ts`），不做「跨项目降权」。相关的别的项目条目就该排在前面。
- **`RankedMemory` 增加 `origin: 'user' | 'own' | 'granted'` 与 `sourceKey: string`（`'user'` 或 projectId）。** 后者是必需的：`Memory.id` 是 `${scope}:${name}`，两个项目里的同名条目会得到完全相同的 id，现有 `compareRanked` 的末级比较会退化成 0。排序改为 `(score, currentScore, pathScore, pinned, scope, sourceKey, id)`，日志与 `selectedIds` 也用 `sourceKey:id`。
- **预算护栏（固定常量）**：`const CROSS_PROJECT_SHARE = 0.5;` —— 注入索引与自动正文里，被授权项目占用的字节不超过总预算的 50%。`user` 与自身项目不计入该上限。
- **索引填充（`renderIndex` / `fillIndex`）**：仍按相关性顺序单次填充，追加一条准入检查——`origin === 'granted'` 的条目只能看到「已用跨项目字节到上限之间」的剩余空间。**实施细化**：这里沿用既有的 bestFit 语义，所以超限的被授权条目不是整条消失，而是退化成更短的形式（先丢描述，再整条跳过），与自身项目在预算紧张时的行为一致；上限本身是字节上限，因此退化也不会突破一半预算。`truncated` 语义不变。
- **正文召回（`renderBodies`）**：同一条护栏作用在 `bodyBytes` 上；`bodyLimit` 仍是全局条数上限。
- **IDF** 在合并后的候选集上计算，跨项目条目会互相影响权重。可接受，样本更多反而更稳。
- **不做内容级去重**：同一事实在两个项目各有条目时会显示两行，与现有行为一致。

## 5. 工具协议与上下文格式

### 5.1 索引里的链接

| 来源 | 链接格式 | 说明 |
|---|---|---|
| user | `user/<name>.md` | 不变 |
| 自身项目 | `project/<name>.md` | 不变（2 段） |
| 被授权项目 | `project/<handle>/<name>.md` | 新增（3 段） |

`handle` = 项目 slug（`basename(仓库根或工作目录)` 小写化，如 `dsh-workspace`）。**slug 冲突时，冲突组内的全部成员退化为完整 id**，保证 handle 唯一且可复现；`md_memory_read` 的 `project` 参数同时接受 handle 与完整 id（完整 id 优先）。

2 段 = 自身、3 段 = 其他项目，这个区分本身就是说明，不用额外编码。

### 5.2 工具

| 工具 | 改动 |
|---|---|
| `md_memory_search` | 结果条目增加 `project: { id, label }`；检索范围 = §1 的可见来源集合 |
| `md_memory_read` | 新增可选 `project`（handle 或 id），缺省 = 当前项目 |
| `md_memory_list` | 条目增加 `project`；新增可选 `project` 过滤 |
| `md_memory_write` / `md_memory_forget` | **不声明** `project`；host 侧显式拒绝传入的同名参数（防未来误加） |
| `md_memory_status` | 新增 `visibleSources: [{ id, label, kind: 'own' \| 'granted' \| 'user' }]`，便于人工/模型审计当前开着什么 |

越权读取的错误：

```
PROJECT_NOT_VISIBLE: md_memory_read 只能读当前项目与已授权项目。
要在项目 X 的会话里读 Y，请在记忆页面「配置 → 召回 → 跨项目访问」勾选。
```

错误信息里给出**用户可执行的下一步**，避免模型自行用 bash 去翻 `~/.dsh/md-memory/projects/` 绕过。

### 5.3 提示词与文案

`MEMORY_POLICY`（`src/prompts.ts`）新增一段，约 6 行：跨项目条目是**只读背景证据**；读别的项目用 `md_memory_read(scope="project", name=…, project=<handle>)`，handle 就是索引链接的第一段；不要把 A 项目的结论写进 B（写入永远落在当前项目）；发现需要但没授权的项目，告知用户在记忆页面开启，不要绕过文件读取。

页面文案同步：

- 删除「包含用户记忆」这一行 toggle（`Settings.tsx`），`README.md` 的配置表同步。
- `recallProject` 文案改为「包含当前项目记忆——控制自身项目；其他项目由下方『跨项目访问』单独授权」（原文「不混入其他项目」已不成立）。
- `docs/previews/show-me-settings.html` 是设置页的静态预览稿，含 `recallUser`，一并更新或标注为历史稿。

### 5.4 不受影响的部分

- **后台提炼**：`extraction.ts` 的候选集继续用 `store.snapshot(task.project)`（user + 自身），**不让提炼看到被授权项目的条目**——它写不进去，看到只会白烧预算并可能把别的项目正文带进辅助调用。写入目标仍是 `task.project`，检查点仍按项目存。
- **子代理**：`rootAgent` 门禁不变，子代理既不注入也不注册工具。
- **存储格式、项目身份、修订/事务/忘记**：一律不动。

## 6. 页面设计（配置 → 召回 → 跨项目访问）

位置：`src/client/Settings.tsx` 的 `recall` 分类，「召回与上下文」section 内、预算数字下方。该分类的 toggle 变为：注入短索引 / 自动召回相关正文 / 包含当前项目记忆（`recallUser` 已删）。

```
┌ 跨项目访问 ─────────────────────────────────────────────────────┐
│ 这里配置「在某个项目的会话里，除了它自己，还能读到哪些记忆」。    │
│ 授权是单向的，且只授予读取。                                     │
│                                                                 │
│ [过滤项目…]                                            [全部关闭] │
│                                                                 │
│ ▸ dsh-md-memory            E:\project\dsh-md-memory   已开放 2/3 │
│   ☑ 用户记忆（跨项目共享）      你的偏好与长期约定               │
│   ☑ dsh-workspace               E:\project\dsh-workspace         │
│   ☐ stock-dashboard-v2          E:\project\stock-dashboard-v2    │
│                                                                 │
│ ▸ dsh-workspace            E:\project\dsh-workspace   已开放 1/3 │
│   ☑ 用户记忆（跨项目共享）                                       │
│   ☐ dsh-md-memory                                                │
│   ☐ stock-dashboard-v2                                           │
│                                                                 │
│ ▸ stock-dashboard-v2                 （未配置，默认仅用户记忆）   │
└─────────────────────────────────────────────────────────────────┘
```

- 每个项目一张卡片（`mm-access-card`），勾选项 = 「用户记忆」1 个 + 其他项目 n−1 个；抬头显示「已开放 k/(n)」。
- 卡片按项目 label 排序；**n > 12 时默认折叠**（否则是 n² 个复选框的墙），点抬头展开；**n > 6 时出现过滤框**，按 label、cwd 与 id 过滤卡片，过滤期间卡片自动展开。
- 矩阵属于 `settings.values`：与其它配置共享 dirty 状态、`保存配置` / `撤销更改` / 未保存离开确认 / `beforeunload`、保存期间 `busy` 禁用。**不新增保存按钮、不新增路由**。
- **保存时客户端为每个已知项目都写出显式条目**（没动过的卡片按当前显示值展开成显式数组）。这条是必需的：页面显示的默认勾选状态来自 `resolveAccess` 的缺省值，只有落盘成显式矩阵，§2.1 的迁移种入值才会在首次保存后定型，之后新建的项目才回到统一默认。
- 保存后服务端返回的 `warnings` / `stale` 让卡片显示「项目已不在记忆中，已忽略」。
- 只有 1 个项目时，卡片里只有「用户记忆」一行，并提示「暂无可授权的其他项目」。
- 无便捷按钮（决策 5）。

## 7. 一致性、审计与安全

- 授权单向、显式、默认最小（只有 user）。
- 只读由作用域解析保证：写入路径根本拿不到矩阵（`write` 只吃 `state.project`）。
- 日志新增 `access.sources`（session、own、granted、user）与 `access.denied`（session、requested、own）；`md_memory_status` 直接暴露 `visibleSources`。
- 撤销即时生效（保存 → `refreshAll`）；已经注入的历史上下文不回收，这与现有语义一致。
- 授权是**对本机所有会话生效**的插件级配置，不是按人分权。管理接口本身已经是 DSH 会话级认证（不带凭据 `GET /api/md-memory/groups` 返回 401）。

## 8. 退化与边界

| 场景 | 行为 |
|---|---|
| 矩阵为空 / 未保存过 | 与 0.3.2 一致（user + 自身），索引字节不变 |
| SETTINGS.md 含旧键 `recallUser` | 读取时 strip；保存时静默丢弃；`false` 会让未配置项目的默认来源变成 `[]`（§2.1） |
| 被授权项目被删除 | 保存时丢弃 + 告警；读取时忽略未知键，不报错 |
| 项目不在矩阵里 | 默认 `['user']`（或迁移期的种入值） |
| 卡片里取消「用户记忆」 | 该项目的会话看不到 user 记忆（矩阵是唯一来源） |
| `recallProject = false` | 不影响被授权项目（它由矩阵决定） |
| 同一仓库多 worktree | 同一 projectId，天然共享，与矩阵无关 |
| 会话无 cwd | 只读 user（现状），没有卡片可配 |
| 子代理 | 不注入、不注册工具（现状） |
| 两个项目有同名条目 | 显示两行，链接靠 handle 区分；排序由 `sourceKey` 兜底 |
| 跨项目内容占满预算 | 固定 50% 护栏兜底，自身/user 仍可填充剩余 |
| handle 冲突 | 冲突组全部用完整 id |
| 被授权项目里有坏文件 | 按现有 `diagnostics` 排除，不影响其他来源 |
| 项目很多（n 大） | 卡片默认折叠 + 过滤框；`snapshot` 成本随授权数线性 |

风险：一次 refresh 读取的项目数 = 1 + 授权数，文件多时抖动明显。护栏是「只读被授权的项目」。若实测慢，再加按 `(projectId, mtime)` 的解析缓存——首版不做，避免缓存与事务恢复交互。

## 9. 测试计划

- `tests/access.test.ts`（新）：`normalizeMatrix` 丢弃未知键/值并记账；`resolveAccess` 的缺省、矩阵决定 user 可见性、项目消失过滤、`legacyDefault` 种入；`projectHandle` 冲突退化。
- `tests/settings.test.ts`（新或并入 store 测试）：含 `recallUser` 的 SETTINGS.md 加载后 `PluginConfig` 无该键；`updateSettings` 提交含 `recallUser` 的 values 不报 `Unknown setting`；`recallUser: false` → 未配置项目默认来源为 `[]`；首次保存后文件里该键消失。
- `tests/store.test.ts`：`snapshot` 带 `extra` 的合并与 diagnostics；`listProjects` 对坏 PROJECT.md 的 `INVALID_PROJECT` 诊断。
- `tests/retrieval.test.ts`：`origin`/`sourceKey` 排序兜底；50% 护栏记账（构造跨项目高分候选，断言跨项目字节不越界且自身条目仍被填充）；`project/<handle>/<name>.md` 渲染。
- runtime 相关测试：未授权读 → `PROJECT_NOT_VISIBLE`；授权读正常；`status.visibleSources`；`write` 不接受 `project`；上下文含跨项目条目。
- `tests/management.test.ts`：保存含 `crossProject` 的 values → SETTINGS.md 内容断言；hash 冲突 409；stale 项目被丢弃并出现在返回值里。
- `tests/client-api.test.ts` + `tests/ui-browser.mjs`：n 张卡片、每卡 n−1+1 个勾选框、勾选后 dirty、保存 payload 正确。
- `tests/desktop-browser.mjs`：临时库造 3 个项目，页面勾选 → 断言 SETTINGS.md 与刷新后的注入索引文本（端到端验收）。
- 回归：`npm run check`（typecheck + vitest + build）、`npm run test:host`、`npm run test:compat`。

`.compat/rc` 与 `.compat/alpha` 是兼容脚本安装的**冻结版本快照**，它们出现 `recallUser` 属于正常，不要改。

## 10. 实施顺序与发布

1. `src/config.ts`（`crossProject`）+ `src/access.ts` + `settings.ts` 的 strip/种入 —— 空矩阵 + 有 `recallUser` 的现网文件下行为不变。
2. `src/store.ts`：`listProjects` / `snapshot(extra)`；`management.ts` 改为复用。
3. `src/retrieval.ts`：`origin` / `sourceKey` / `CROSS_PROJECT_SHARE` 预算 / 链接渲染。
4. `src/runtime.ts`：`resolveAccess`、`read|search|list` 的 `project` 参数、`status.visibleSources`、`PROJECT_NOT_VISIBLE`、`access.*` 日志。
5. `src/prompts.ts`：策略补丁；`src/client/Settings.tsx`：删 `recallUser` toggle + 新增矩阵块；`style.css` 卡片样式。
6. 文档：`README.md` 配置表、`docs/maintenance.md`（模块表加 `src/access.ts`、错误码表加 `PROJECT_NOT_VISIBLE`）、`docs/UI-DESIGN.md`（配置节）、`DESIGN.md`（新增一章）、`docs/previews/show-me-settings.html`。
7. 发布：版本 → `0.4.0` → `npm run check` → `npm pack --pack-destination release` → profile 的 `file:` 指向新 tgz → `pnpm install --ignore-scripts`。**宿主侧改动需要重启桌面端**（`lib/index.js` 只在进程启动时加载）；之后客户端只刷新记忆页面即可。

## 11. 遗留待办（非阻塞）

- 实测 n 大时的 refresh 抖动，再决定要不要 mtime 缓存。
- 「双向复制 / 互为可见」按钮（决策 5 已推迟）。
- handle 在索引里多占约 20 字符/条，若实测索引预算吃紧，可考虑只对相关性最高的前几条打印 handle。
