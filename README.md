# dsh-md-memory

DeepSeek Harness 的 Markdown 记忆插件。用户偏好、项目约定、索引、修订、事务、检查点和日志全部存为 `.md` 文件。

兼容 **DSH 0.2.0-rc.2 与 0.2.1-alpha.1**。两个版本使用同一套代码与数据格式。

## 记忆行为

- 主 Agent 在当前轮调用工具即时保存；提示词结合 ZCode 的主动保存、四类记忆、保存前查重，以及 Claude Code 的长期事实边界、必须检索的场景和短索引纪律。
- 正常完成一轮后，插件独立调用会话的 provider/model，提炼新增的真实用户文本与助手文本。辅助调用没有工具，不启动额外 Agent，不追加主会话轮次。
- 短索引放得下时完整注入可读来源（用户层、当前项目、已授权项目）的条目；放不下时按相关性排序，继续补入低分、零分条目，直到无法容纳下一条完整记录。不会用空白凑预算。
- 正文独立按需召回，默认最多 5 条、12 KiB。正文没有匹配就不注入；Agent 也可通过工具搜索全库、读取完整正文。
- 项目跟随 **DSH 会话 header.cwd**。同一 Git 仓库的子目录和 worktree 共享记忆；独立 clone 分开；非 Git 项目按工作目录真实路径分开。
- 错误通过工具结果、状态工具和日志暴露。冲突不会自动覆盖，损坏文件不会自动改写，死进程留下的写锁需要检查后清理。

## 安装

插件尚未发布到 npm，直接从 GitHub 安装即可。仓库已包含构建产物 `lib/`，安装时不需要任何构建步骤，也不需要 Node 之外的额外准备。

**命令行 profile**（`web` / `headless` / `tui` 等）：

```powershell
dsh plugin --profile <profile> add github:dgagf111/dsh-md-memory
```

**DSH Desktop（Electron 桌面端）**：推荐在桌面端的**插件市场**界面里安装；也可以用桌面端自带的 `dsh` 启动器执行同一条命令：

```powershell
# <安装目录>\resources\runtime\cli\bin\dsh.cmd
dsh plugin --profile desktop add github:dgagf111/dsh-md-memory
```

注意：另装的独立 `dsh` CLI 会拒绝 desktop profile（`profile "desktop" is managed exclusively by the Electron application`），桌面端自带的启动器才被授权管理它。也可以把 `npm pack` 产出的 `.tgz` 交给插件管理界面安装。

装好后**重启 DSH**，侧边栏即出现“记忆”入口。升级用同一个 `add` 命令重跑。

从源码构建与自测：

```powershell
npm ci
npm run check        # typecheck + 单测 + 构建
npm run test:host    # 真实宿主契约
npm run test:compat  # RC 与 Alpha 双版本
npm pack             # 产出 release/dsh-md-memory-<版本>.tgz
```

> `lib/` 是提交进仓库的构建产物，为的是让 `pnpm`/`npm` 从 Git 安装时无需执行构建脚本（pnpm 默认拦截依赖的构建脚本，只有产物在仓库里才能零配置装好）。因此**改动 `src/` 后必须重新 `npm run build` 并把 `lib/` 一起提交**；CI 会用 `git diff --exit-code -- lib` 拦住忘记提交或产物过期的改动。

宿主侧代码（`lib/index.js`）只在进程启动时加载，升级后需要重启 DSH；只有客户端界面改动可以靠刷新记忆页面生效。

包自带 `dsh.bundle.patch` 元数据和 `cordis.patch.yml`，安装后插入 `md-memory` 配置行。插件依赖宿主的 tools、systemPrompt、agents、sessions 服务；后台提炼额外使用 llm，恢复旧会话时使用 sessionQuery。标准 RC/Alpha 宿主提供这些服务。

如果已有其他自动记忆插件，先在同一 profile 停用其注入与提炼，避免重复调用。原来的记忆文件不会自动导入。

安装后 DSH 侧边栏提供“记忆”入口。可浏览用户与所有已记录项目，搜索、编辑、新建、停用、移动和删除记忆；项目管理不要求活跃 Agent。编辑、移动与删除都检查 revision/hash，冲突时保留草稿并提示重新读取。

编辑器的“移动”把一条记忆交给用户记忆或其他项目：正文、标签、创建时间与修订号一起移动；目标范围已有同名记忆时明确拒绝，不覆盖。原范围删除正文与修订并留下遗忘标记，后台提炼不会把它写回原范围。

选中某个项目后，记忆库标题栏提供“清空项目记忆”：弹窗显示范围名、路径与将删除的条数，确认后删除该项目的全部记忆，包括修订历史、遗忘标记与提炼检查点，并重建空索引；“取消”不做任何改动。`PROJECT.md` 保留，项目仍在页面里。用户记忆是跨项目共享的，不能整库清空，只能逐条删除。清空会丢掉提炼检查点，因此已绑定会话的**会话历史仍可能被重新提炼**成新记忆；要彻底停用可在“配置 → 提炼”里关闭自动提炼。

“配置”页提供召回范围、索引和正文开关、预算与数量上限、**逐项目的跨项目读取授权**，以及后台提炼、模型路由、超时、重试与详细日志。保存到记忆目录的 `SETTINGS.md`，立即生效并刷新已绑定会话。关闭提炼清空排队任务，已运行任务会完成。

## 配置

配置示例在 [examples/cordis.patch.yml](examples/cordis.patch.yml)。profile override 会替换该行的完整 config。页面保存的 SETTINGS.md 优先于 profile 默认值；memoryDir 仅由 profile 决定，页面只读。手工修改 SETTINGS.md 后重新加载管理页或插件可应用新设置。

| 配置 | 默认 | 作用 |
|---|---:|---|
| memoryDir | 空 | `$DSH_HOME/md-memory`；没有 DSH_HOME 时为 `~/.dsh/md-memory` |
| indexBytes | 1024 | 自动注入的短索引 UTF-8 总预算，包括标题和读取提示 |
| bodyBytes | 12288 | 自动注入的正文 UTF-8 总预算，包括条目标题和截断提示 |
| indexEnabled | true | 是否注入短索引 |
| recallProject | true | 当前项目是否参与索引与自动正文召回 |
| crossProject | {} | 逐项目的读取授权：`{项目id: [user 和/或其他项目id]}`，缺省只读自己与 user |
| bodyLimit | 5 | 自动注入的正文条目数量上限 |
| autoRecall | true | 根据当轮需求自动带入相关正文；关闭后仍注入短索引 |
| autoExtract | true | 成功轮结束后后台提炼 |
| extractionProvider / extractionModel | 空 | 沿用会话有效模型路由；可明确指定辅助模型 |
| extractionTimeoutMs | 30000 | 每次辅助调用的时限 |
| extractionMaxTokens | 4096 | 每次输出 token 上限 |
| extractionMaxOperations | 5 | 每批最多写入数 |
| extractionAttempts | 2 | 模型调用和输出解析的尝试数 |
| enableInHeadless | false | 允许常规 `dsh headless` / `--profile headless` 运行后台提炼 |
| debug | true | 额外记录排名、预算与调度日志；可关闭以减少日志量 |

自定义无界面 profile 请明确设置 `autoExtract: false`，或为后台任务的排空安排关停等待。插件卸载会取消并等待其辅助调用结束。

## 工具

| 工具 | 输入要点 | 输出 |
|---|---|---|
| md_memory_search | query、可选 limit | 全部可读来源的相关候选，每条带 `project` |
| md_memory_read | scope、name、可选 project | 完整正文、revision、hash，以及正文里 `[[name]]` 互链的解析结果 `related`（`exists=false` 即已被改名或忘记的坏链接，`omitted` 是超出上限没列出的条数） |
| md_memory_write | scope、name、title、description、type、body | committed、revision、hash；更新要带 expectedRevision 和 expectedHash |
| md_memory_forget | scope、name、userRequested=true | 删除正文和修订后的提交结果 |
| md_memory_list | 可选 scope、可选 project | 短条目列表，每条带 `project` |
| md_memory_status | 无 | 工作区身份、`visibleSources`、预算、坏文件诊断和提炼状态 |

`scope` 为 `user` 或 `project`。`name` 使用英文小写 kebab-case，不含 `.md`；标题、描述和正文使用用户的语言。`type` 为 `user`、`feedback`、`project`、`reference`。

### 跨项目读取

默认一个会话只读得到**用户层**和**当前项目**。在“配置 → 召回 → 跨项目访问”里，可以给每个项目单独勾选它还能读哪些记忆块（用户层 + 其他项目）；授权是**单向**的，且**只授予读取**——写入、删除和后台提炼永远落在当前项目。

被授权的条目在索引里显示为 `project/<handle>/<name>.md`（handle 是项目目录名，同名冲突时退化为完整项目 id），读取时把 handle 传给 `project` 参数即可。被授权项目合计最多占用索引与正文预算的一半，避免把当前项目的上下文挤出去。`md_memory_status` 的 `visibleSources` 列出当前会话能读的全部记忆块。

`recallUser` 是 0.3.x 的全局开关，0.4.0 起由每个项目卡片里的“用户记忆”勾选框取代；旧文件里的该键会被忽略，若原来是 `false`，未配置项目的默认来源会相应变成空。

明确要求记住时 `md_memory_write` 设置 `userRequested: true`。重新记住已忘记的条目也需要这个标记。正文提交成功但上下文刷新失败时，工具仍返回 `committed: true` 并携带 `contextWarning`。

## 目录与人工维护

```text
md-memory/
  SETTINGS.md
  user/
    MEMORY.md
    chinese-preference.md
    history/<name>/<revision>-<hash>.md
    transactions/<operation>.md
    forgotten/<name>.md
    state/<session-hash>.md
  projects/<repository-name>-<identity-hash>/
    PROJECT.md
    MEMORY.md
    project-decision.md
    history/ ...
    transactions/ ...
    forgotten/ ...
    state/ ...
  logs/<YYYY-MM-DD>-<pid>.md
  moves/<operation>.md  # 仅在跨范围移动尚未完成时存在
```

可以直接编辑主题 `.md` 的正文、description、tags、aliases 和 paths。下一次模型步骤会重新读取文件；已有写入提案必须匹配新 hash 才能提交。`MEMORY.md` 是生成索引，源数据是主题文件。人工编辑不会产生插件修订备份，请用自己的版本管理保留编辑历史。

单条主题文件上限 128 KiB，正文写入上限 32,000 字符。插件不会自动拆分文件。`forgotten` 只保留标记，不保留原正文；宿主已经保存的会话历史由 DSH 自己管理。

更多排障步骤见 [维护文档](docs/maintenance.md)，接口与验证范围见 [兼容性说明](docs/compatibility.md)，提示词来源及融合原则见 [提示词说明](docs/prompts.md)。原始调研与审核规划保留在工作区根目录。

采用确定性关键词、中文分词与声明式路径相关性；没有向量库、闲时整合或团队同步。

