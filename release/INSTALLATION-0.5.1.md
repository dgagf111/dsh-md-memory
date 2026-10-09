# 0.5.1 记忆粒度：一条主题一条目，先查后建；提示词改中文

2026-10-09。两件事：

1. 让模型在写记忆前先检查是否已有条目覆盖同一主题（包括已经过时的旧条目）：命中就更新，没命中才新建。**不是**禁止新建——新建是新事实的正常结果，只是不再当默认动作。
2. 所有注入给模型的提示文本改为简体中文：主提示词、后台提取提示词、6 个 `md_memory_*` 工具说明与参数说明、索引 footer、上下文里的不可用提示。工具名、参数名、scope/type 取值与 JSON 字段保持 ASCII。

## 原因（本机日志实测）

本机 `~/.dsh/md-memory/logs/2026-10-09-*.md`（debug 已开）：

- `windows-iphone-control-toolchain` 05:35:39 由后台 extraction 建；随后 agent 在 08:22:28 / 08:22:29（相隔 1 秒）新建 `windows-apple-root-ca-trust-gap` 与 `sidetap-windows-iphone-control`，08:44:53 又新建 `sidetap-wifi-wireless-limits` —— 一条「Windows 控制 iPhone」主题散成 4 条。
- 08:21:26 的 `retrieval.selected` 已包含 `windows-iphone-control-toolchain`，即同主题条目就在注入索引里；但 08:20–08:23 窗口内既没有 `memory.read` 也没有 `md_memory_search`。
- 全库统计：`memory.write_committed` 40 次（含 11 次迁移 import）、`memory.read` 121 次，而 `md_memory_search` 只有 4 次（05:51 / 07:48 / 08:00 / 08:06），没有一次落在这几条记忆的写入前。
- 提示词自身矛盾：`docs/prompts.md` 声称采用 ZCode 的「一条主题一个文件」，但两处 policy 都以 `keep one durable fact per entry` 收尾 —— 一个主题天然由多个事实组成，于是被拆成多条平级条目，模型的做法在当时是**合规**的。

## 改动

- `src/prompts.ts`：`MEMORY_POLICY` 与 `EXTRACTION_POLICY` 全文中文化。新增 `条目粒度——一条主题一条目，不是一条事实一条目` 与 `新建不是默认动作，先检查才是` 三步（两个角度 search → read 所有可能命中的条目 → 命中则更新、未命中则新建）；尾句 `keep one durable fact per entry` 改为「一条主题一条目、被改动的事实带日期与原因」；内嵌「Windows 控制 iPhone 属一个主题」的反例。
- `src/prompts.ts` `EXTRACTION_POLICY`：改为「先更新再新建」；任何候选覆盖该主题（即使部分覆盖、标题/标签不同）都必须返回该条目的更新；候选未覆盖才新建；主题明显有宿主但宿主不在候选清单里时，不得为同一主题新建平行条目。
- `src/runtime.ts`：6 个工具 description、`name`/`project`/`userRequested` 三个参数说明、以及上下文里的 `记忆不可用：…` 全文中文化；`md_memory_search` / `md_memory_write` 加入检查优先的措辞（工具说明是离写入决策点最近的提示面）。
- `src/retrieval.ts`：`INDEX_FOOTER` 改为中文（`用 md_memory_read(scope, name) 读完整条目；md_memory_search 覆盖整个库。同主题扩展原条目，不要新建重复。`，133 B）。
- `src/extraction.ts`：`EXTRACTION_POLICY.replace()` 的替换锚点同步改为 `最多 5 个操作`，否则中文提示词里的操作数上限不会被改写。
- 文档同步：`docs/prompts.md` 新增「粒度：一条主题一条目」小节；`DESIGN.md` §7.2 第 4 条重写。
- 仍然保持英文的模型可见文本：索引标题 `## Memory index (shown/total; partial|complete)`（`tests/retrieval.test.ts` 断言了该格式）、`MemoryError` 的错误消息与错误码、提取 JSON 的字段名。行为、存储格式、工具参数与预算均未改动——write 仍要求 revision/hash，没有任何硬拦截。

## 验证

- `npm run check` 通过：typecheck 通过、88/88 单测通过、构建通过。
- 过程中真实撞到预算回归：footer 加长后 `tests/retrieval.test.ts` 的 `does not let one huge line block later short entries`（budget 300）从 shown=2 掉到 1；把 footer 压到 133 B（原英文 94 B）后恢复（该用例余量 9 B）。
- `lib/index.js` 逐串核对：主/后台 policy、工具说明、中文 footer、`记忆不可用` 均已进入构建产物。
- `npm run test:host` 通过：用真实 DSH 宿主加载 `lib/index.js`，覆盖工具面、上下文刷新、后台提取、冲突、遗忘、移动、子代理隔离、resume/fork、工作区绑定与跨项目授权。其中 `tests/host-harness.mjs` 有 3 处断言依赖提示词文本（后台提取的 `system` 前缀、主调用里出现 `Before writing a new entry`），已同步改为中文锚点（`你是一个后台记忆提取任务` / `一条主题一条目`），否则改语言就会挂。
- `npm run test:compat` 通过：0.2.0-rc.2 + Cordis 4.0.4，以及 0.2.1-alpha.1 + Cordis 4.0.5-alpha.1 两个宿主版本各跑一遍宿主契约。
- 包：`dsh-md-memory-0.5.1.tgz`，229,363 字节。
- SHA-256：`d2536e3ed03e2981aa6806e098fd7556d3d184f0959fd3be9b3c5aa7000369ec`。

## 安装

桌面 profile 不能用 `dsh plugin`（Electron 独占）。等价路径：

```powershell
# 1) 指向新 tarball
#    ~/.dsh/profiles/desktop/package.json 里
#    "dsh-md-memory": "file:E:/project/dsh-md-memory/release/dsh-md-memory-0.5.1.tgz"
# 2) 在 profile 目录安装
pnpm install --ignore-scripts
```

`MEMORY_POLICY` 是模块常量，**必须重启 DSH** 才生效（与客户端 bundle 只需刷新页面不同）。

本机本次实测的安装细节：

- desktop profile 的 `pnpm-workspace.yaml` 是 `nodeLinker: hoisted`，所以 `node_modules/dsh-md-memory` 是**真实目录**而不是 pnpm junction（`Get-Item` 的 Attributes 为 `Directory`、无 `ReparsePoint`，`node_modules/.pnpm` 下没有对应条目）。
- 同一版本重新打包后 `pnpm install` 不会刷新已装目录（回 `Already up to date`）；即使把该目录删掉，`pnpm install`（含 `--force`）也不会重建。**必须**用 `pnpm add "file:E:/project/dsh-md-memory/release/dsh-md-memory-0.5.1.tgz" --ignore-scripts` 才恢复。
- 装完核对了文件级一致：`node_modules/dsh-md-memory` 的 `package.json` 为 0.5.1，`lib/index.js`、`lib/client.js`、`docs/prompts.md` 与工作区逐文件哈希相同；并用该已装 `lib/index.js` 跑了一遍 `tests/host-harness.mjs`（`file:///` URL），宿主契约通过。

## 重启后的观察指标

用现成的 debug 日志回归：

- `md_memory_search` / `memory.write_committed` 比例（0.5.1 前是 4/40）。
- 新建 vs 更新条目数，以及同一 topic tag 簇的条目数。
- 索引 `shown/total` 截断率（同簇近重复被合并后应下降）。
