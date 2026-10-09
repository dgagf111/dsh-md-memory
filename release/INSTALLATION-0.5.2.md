# 0.5.2 `md_memory_read` 解析 `[[name]]` 互链；修正「会展开」的错误描述

2026-10-09。两件事，都围绕 `[[name]]`：

1. **（a）改文档**：[DESIGN.md](../DESIGN.md) §7.2 第 8 条原文写「正文可用 `[[name]]` 给出关联，但**展开**有跳数与字节上限」——"展开"这件事从来没有实现，`[[` 只出现在提示词字符串里。改成与实现一致的描述。
2. **（b）做成真功能**：`md_memory_read` 现在把正文里的互链解析成 `related`，让坏链接从静默变成可见。

## 为什么

`[[name]]` 是沿用 Claude Code / ZCode 家族的写法约定，作用是让读正文的模型知道"还能去哪看"，从而不必复制正文、避免同一主题再长出第二条条目。但在此之前没有任何代码存储、渲染或解析它：桌面记忆页的正文框里就是纯文本，名字拼错或指向一条已被改名/忘记的条目时**完全静默**——本机刚做的 4→1 合并就留下了这种风险（例如 `sidetap-wifi-wireless-limits` 这个名字已经进墓碑）。实测还发现第二种噪声：一条讲"互链规则"的记忆，正文里的语法示例**即使写在反引号里**，在旧解析器下也会被算成一条指向不存在条目的死链——这正是要跳过行内代码与代码块的原因。

## 改动

- 新增 `src/links.ts`（纯函数，无 IO）：
  - `extractLinks(body)`：按正文顺序取唯一的互链目标。先剥掉**行内代码与代码块**（`` ` `` 与 ``` 包裹的内容是字面文本，不算链接），再匹配小写 kebab-case 名字（大写、空格、下划线、未闭合都不算），名字上限 64，重复只报一次。
  - `resolveLinks(names, candidates, rank, locate)`：解析每个目标是否存在。命中时给出 `scope`、`project`（块的索引标签）、≤120 字符的 `description` 提示；同名存在于多个可读块时取最近的一个（**本条目所在块 → 当前项目 → 用户作用域 → 被授权项目**）并标 `ambiguous`。
  - 上限 `LINK_LIMIT = 20`，超出的数量进 `omitted`，不静默丢弃。
- `src/runtime.ts`：`md_memory_read` 的返回值追加 `related`/`omitted`（正文无链接时两个字段都不出现，输出与旧版一致）；工具说明写明 `exists=false` 的含义与"正文讲语法本身时会误报、忽略即可"。
- `src/prompts.ts`：`MEMORY_POLICY` 的工具行同义改写；粒度那条里的占位写法从英文 `[[name]]` 改成放进反引号的中文占位名，避免以后由提示词自己制造幽灵死链。
- `src/core.ts`：导出 `links`（与 `store`/`retrieval` 等核心模块一致）。
- 测试：新增 `tests/links.test.ts`（11 项：顺序/去重/非法名/64 字符边界/代码内外/未知目标/多块优先级/歧义标记/上限与 omitted/描述提示截断）；`tests/host-harness.mjs` 增加真实宿主断言（活链接带 `scope`/`project`/`description`，死链接 `exists=false` 且不带 `project`，`omitted=0`）。
- 文档：`DESIGN.md` §7.2 第 8 条改写；`docs/prompts.md` 新增「互链：`[[name]]` 是写法约定，不存储关系」一节；`README.md` 工具表补上 `related`。

## 行为边界

- **不注入其他条目的正文**，每条链接只带 ≤120 字符描述提示，token 成本很小。
- 同名跨块时只报最近的一个并标 `ambiguous`，不列全部；`omitted` 告知被上限截掉多少条。
- **行内代码与代码块里的写法不算链接**；正文只是在讲这个写法本身、又没放进反引号时，仍会报一条 `exists=false`（这是字面匹配的必然结果，工具说明里已写明忽略即可）。
- 解析用本会话的当前快照（每次 write / forget / step 后刷新），刚提交的条目立刻可解析；只在**本会话可读的块**里找，不做跨作用域越权。

## 验证

- `npm run check`：typecheck 通过、**99/99** 单测通过（原 88 + links 11）、构建通过。
- `npm run test:host`：真实 DSH 宿主契约全通过（含新增的 `related` 断言）。
- `npm run test:compat`：0.2.0-rc.2 + Cordis 4.0.4 与 0.2.1-alpha.1 + Cordis 4.0.5-alpha.1 双双通过。
- 过程中真实修掉两处：`RelatedLink` 声明成 `interface` 时没有隐式索引签名、不能赋给工具 JSON 契约（改成对象字面量 `type` 别名）；测试里把 `[[closed]]` 误当成非法名。
- 移动后的实链体检：`windows-iphone-control`（已被移到 `dsh-iphone-use` 项目）的两条互链在新的可读块里都命中——`remote-mac-mini`（用户作用域）、`dsh-phone-control-plugins`（`dsh-workspace`，该项目已获授权）；用户作用域全库复查为 **0 条死链**。

## 安装

```powershell
# 指向新 tarball 并强制刷新（同一版本的旧包不会被 pnpm 重新取）
pnpm add "file:E:/project/dsh-md-memory/release/dsh-md-memory-0.5.2.tgz" --ignore-scripts
```

包：`dsh-md-memory-0.5.2.tgz`，237,694 字节。
SHA-256：`4126626153e9a6e3e337ad15e482dbadce68d8fac6bec35ab6afd0d2f40d2e92`。

`md_memory_read` 的返回值是宿主侧代码，**必须重启 DSH** 才生效。
