# 0.6.0 安装记录

2026-10-10，本机 DSH Desktop 已安装 0.6.0（整项目清空 + 弹窗确认）。

- 安装包：`E:/project/dsh-md-memory/release/dsh-md-memory-0.6.0.tgz`（275,306 字节）
- SHA-256：`737dd0ea5d28f614269ffff47e1c065a4d09f1ac63eb97a9f4e62ac8d91481f6`
- 桌面 profile：`C:/Users/89123/.dsh/profiles/desktop`
- 依赖改动：`"dsh-md-memory": "file:E:/project/dsh-md-memory/release/dsh-md-memory-0.5.3.tgz"` → `…dsh-md-memory-0.6.0.tgz`，随后在该 profile 目录执行 `pnpm install --ignore-scripts`
- 安装前配置备份：`C:/Users/89123/.dsh/backups/md-memory-0.6.0-install-20261010-120802`
- 提交：`b67c31f`（已推送到 `origin/main`），功能设计见 [DESIGN.md §12.3](../DESIGN.md)

功能：管理页「记忆库」标题栏新增「清空项目记忆」（只对项目范围开放，弹窗显示范围名、路径与条数后确认），`POST /api/md-memory/reset` 删除该项目目录里除 `PROJECT.md` 与写锁之外的一切并重建空索引、同时丢弃排队中的提炼任务。语义与代价见 DESIGN.md §12.3。

验证：`npm run check`（121 项测试 + typecheck + build）、`npm run test:host`、`npm run test:compat`（RC 0.2.0-rc.2 与 Alpha 0.2.1-alpha.1）与 `node tests/ui-browser.mjs` 全绿。

安装后核对：profile 依赖为 0.6.0，`node_modules/dsh-md-memory/package.json` 版本 0.6.0，`lib/index.js`、`lib/core.js`、`lib/client.js` 三个产物与仓库构建的 SHA-256 逐一相同，插件入口 import 成功。`node tests/desktop-browser.mjs` 在**未重启**的宿主上通过（新客户端 bundle 已按需生效：项目范围出现清空入口、弹窗可打开与取消、用户范围没有该入口，结果写入 `release/ui/desktop-result.json` 的 `wipe: true`）。

⚠️ 安装时 DSH 正在运行，尚未重启。**`/api/md-memory/reset` 是宿主侧新路由，只在进程启动时加载**：重启前在记忆页点「确认删除」会返回 HTTP 404。宿主侧清空能力须重启 DSH 后生效；`desktop-browser` 只覆盖了客户端界面，未把重启后的真实清空当作已验证。
