# 0.7.0 安装记录

2026-10-10，本机 DSH Desktop 已安装 0.7.0（**整体移除后台提炼**，记忆只由显式写入产生）。

- 安装包：`E:/project/dsh-md-memory/release/dsh-md-memory-0.7.0.tgz`（226,869 字节）
- SHA-256：`ff52c5332f3c70cff09345e988e37fb099abc2208fd89abed3dabb51816fa2a8`
- 桌面 profile：`C:/Users/89123/.dsh/profiles/desktop`
- 依赖改动：`"dsh-md-memory": "file:…release/dsh-md-memory-0.6.0.tgz"` → `…dsh-md-memory-0.7.0.tgz`
- 安装方式：在 profile 目录执行 `pnpm add "file:E:/project/dsh-md-memory/release/dsh-md-memory-0.7.0.tgz" --ignore-scripts`（同一路径重新打包时 `pnpm install` 只会回 `Already up to date`，必须用 `pnpm add` 刷新）
- 安装前配置备份：`C:/Users/89123/.dsh/backups/md-memory-0.7.0-install-20261010-134007`（`package.json` 与 `pnpm-workspace.yaml`）
- 设计记录：`DESIGN.md` §12.4

## 删除范围

`src/extraction.ts`、`src/completion.ts`、`ExtractionScheduler`、`session/event` 提炼监听、`restoreMessages`、`EXTRACTION_POLICY`、`Checkpoint`、`MemoryStore.checkpoint` / `saveCheckpoint`、`WriteInput.observedAt`、8 个配置项（`autoExtract` / `extractionProvider` / `extractionModel` / `extractionTimeoutMs` / `extractionMaxTokens` / `extractionMaxOperations` / `extractionAttempts` / `enableInHeadless`）、配置页「记忆写入」里的全部开关、`md_memory_status` 的 `extraction` / `autoExtract` 字段、reset 响应的 `cancelledExtractions`，以及 `@deepseek-ai/dsh-session-query` peer 依赖。

旧 `SETTINGS.md` 里的 8 个键加入 `LEGACY_SETTINGS`：仍可加载，读取与保存时静默剥离，下一次保存即消失（与 0.4.0 移除 `recallUser` 同一套处理）。旧条目的 `source.kind: extraction` 仍被读取与更新。`state/` 检查点目录不再读写，清空项目时作为普通产物删除。

## 验证

- `npm run check`：typecheck + 106 项单测 + 构建（0.6.0 为 121；删除 `tests/extraction.test.ts`、`tests/extraction-recovery.test.ts`，新增旧配置键剥离与显式更新停用条目等断言）。
- `npm run test:host`：真实宿主契约（一轮只有该轮自己的模型调用、恢复会话不产生任何调用、清空后遗留 `state/` 一并消失）。
- `npm run test:compat`：RC `0.2.0-rc.2` 与 Alpha `0.2.1-alpha.1` 双双通过。
- `node tests/ui-browser.mjs`：页面交互全绿，并断言「记忆写入」只剩说明文字、旧开关不存在；截图已刷新到 `release/ui/`。

安装后核对：`node_modules/dsh-md-memory/package.json` 版本 0.7.0；`lib/index.js`、`lib/core.js`、`lib/client.js` 三个产物与仓库构建的 SHA-256 逐一相同；`lib/index.js` 里已无 `ExtractionScheduler`；`lib/` 下不再有 `extraction.d.ts` / `completion.d.ts`。

## ⚠️ 重启前 / 重启后的差别

- **客户端已经生效**：宿主按需重取客户端 bundle，刷新页面即加载 0.7.0 的界面。实测打开 配置 → 记忆写入 已是新文案（「只有显式写入才会落盘，没有后台提炼」，没有任何开关），旧开关计数为 0。
- **宿主侧仍是 0.6.0，直到重启 DSH**：管理接口、配置 schema、系统提示词、`md_memory_status` 的返回结构都只在进程启动时加载。因此此刻 `GET /api/md-memory/settings` 仍会返回 `autoExtract` 等字段——这正是 `release/ui/desktop-result.json` 里 `manualWriteOnly: false` 的原因（该字段由 `tests/desktop-browser.mjs` 在**未重启**的宿主上记录，重启后重跑会变成 `true`）。
- 未重启期间不影响使用：0.6.0 的后台提炼仍在按旧代码运行（`SETTINGS.md` 里 `autoExtract: true`）。**重启 DSH 后**提炼才真正消失，`settings` 接口也不再返回这些键；重启会掐断当前会话，由用户自己执行。
