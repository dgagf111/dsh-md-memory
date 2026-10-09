# 0.5.2 `md_memory_read` 解析 `[[name]]` 互链；修正「会展开」的错误描述

2026-10-09。两件事，都是围绕 `[[name]]`：

1. **（a）改文档**：[DESIGN.md](../DESIGN.md) §7.2 第 8 条原文写「正文可用 `[[name]]` 给出关联，但**展开**有跳数与字节上限」——"展开"这件事从来没有实现，`[[` 只出现在提示词字符串里。改成与实现一致的描述。
2. **（b）做成真功能**：`md_memory_read` 现在把正文里的 `[[name]]` 解析成 `related`，让坏链接从静默变成可见。

## 为什么

`[[name]]` 是沿用 Claude Code / ZCode 家族的写法约定，作用是让读正文的模型知道"还能去哪看"，从而不必复制正文、避免同一主题再长出第二条条目。但在此之前没有任何代码存储、渲染或解析它：桌面记忆页的正文框里就是纯文本，名字拼错或指向一条已被改名/忘记的条目时**完全静默**——本机刚做的 4→1 合并就留下了这种风险（例如 `sidetap-wifi-wireless-limits` 这个名字已经进墓碑）。

## 改动

- 新增 `src/links.ts`（纯函数，无 IO）：
  - `extractLinks(body)`：按正文顺序取唯一的 `[[name]]`；只认小写 kebab-case（大写、空格、下划线、未闭合都不算链接），名字上限 64，重复只报一次。
  - `resolveLinks(names, candidates, rank, locate)`：解析每个目标是否存在。命中时给出 `scope`、`project`（块的索引标签）、≤120 字符的 `description` 提示；同名存在于多个可读块时取最近的一个（**本条目所在块 → 当前项目 → 用户作用域 → 被授权项目**）并标 `ambiguous`。
  - 上限 `LINK_LIMIT = 20`，超出的数量进 `omitted`，不静默丢弃。
- `src/runtime.ts`：`md_memory_read` 的返回值追加 `related`/`omitted`（正文无链接时两个字段都不出现，输出与旧版完全一致）；工具说明与 `MEMORY_POLICY` 的工具行同步写明「`exists=false` 就是坏链接，顺手改掉」。
- `src/core.ts`：导出 `links`（与 `store`/`retrieval` 等核心模块一致）。
- 测试：新增 `tests/links.test.ts`（10 项：顺序/去重/非法名/64 字符边界/未知目标/多块优先级/歧义标记/上限与 omitted/描述提示截断）；`tests/host-harness.mjs` 增加真实宿主断言（活链接带 `scope`/`project`/`description`，死链接 `exists=false` 且不带 `project`，`omitted=0`）。
- 文档：`DESIGN.md` §7.2 第 8 条改写；`docs/prompts.md` 新增「互链：`[[name]]` 是写法约定，不存储关系」一节；`README.md` 工具表补上 `related`。

## 行为边界

- **不注入其他条目的正文**，每条链接只带 ≤120 字符描述提示，所以这个功能的 token 成本很小。
- 同名跨块时只报最近的一个并标 `ambiguous`，不列全部；`omitted` 告知被上限截掉多少条。
- 不做 Markdown 结构解析：代码块里的 `[[...]]` 也会被当成链接解析（与"索引/正文都是纯文本"的定位一致）。
- 解析用的是本会话的当前快照（每次 write / forget / step 后刷新），所以刚提交的条目立刻可解析；解析**不做跨作用域越权**，只在本会话可读的块里找。

## 验证

- `npm run check`：typecheck 通过、**98/98** 单测通过（原 88 + links 10）、构建通过。
- `npm run test:host`：真实 DSH 宿主契约全通过（含新增的 `related` 断言）。
- `npm run test:compat`：0.2.0-rc.2 + Cordis 4.0.4 与 0.2.1-alpha.1 + Cordis 4.0.5-alpha.1 双双通过。
- 过程中真实撞到并修掉一处类型问题：`RelatedLink` 若声明为 `interface` 就没有隐式索引签名，不能赋给工具的 `JsonValue` 契约；改成对象字面量 `type` 别名解决。

## 安装

```powershell
# 指向新 tarball 并强制刷新（同一版本的旧包不会被 pnpm 重新取）
pnpm add "file:E:/project/dsh-md-memory/release/dsh-md-memory-0.5.2.tgz" --ignore-scripts
```

包：`dsh-md-memory-0.5.2.tgz`，236,359 字节。
SHA-256：`b9d38267475464536d24a7dc9d7c677c3d72fe9b7fd9ca0840c491194597cf38`。

`md_memory_read` 的返回值是宿主侧代码，**必须重启 DSH** 才生效。
