# 0.8.0 安装记录

2026-10-10，本机 DSH Desktop 已安装 0.8.0（**记忆清空后可删除整个记忆项目**）。

- 安装包：`E:/project/dsh-md-memory/release/dsh-md-memory-0.8.0.tgz`（233,211 字节；npm 报的 shasum `be8402f5f45615845ae1e298f7ab59146c40c2e4`）
- SHA-256：`3630d752b522e71277649583b29ec9314062d8c840e1637ebce3bb02bfff986d`
- 桌面 profile：`C:/Users/89123/.dsh/profiles/desktop`
- 依赖改动：`…release/dsh-md-memory-0.7.0.tgz` → `…release/dsh-md-memory-0.8.0.tgz`
- 安装方式：在 profile 目录执行 `pnpm add "file:E:/project/dsh-md-memory/release/dsh-md-memory-0.8.0.tgz" --ignore-scripts`
- 安装前配置备份：`C:/Users/89123/.dsh/backups/md-memory-0.8.0-install-20261010-140442`（`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`）
- 设计记录：`DESIGN.md` §12.5；功能提交 `597dc53`

## 新增行为

`POST /api/md-memory/remove`，输入 `{scope:'project', projectId, confirm:true}`，成功返回 `{warnings}`；管理路由 7 → 8 条。页面入口「删除记忆项目」只在项目已经清空（0 条条目，且没有坏文件诊断）时可用：项目目录、`PROJECT.md` 与空索引一起删除，记忆库不再列出该项目。目录仍有条目时返回 `PROJECT_NOT_EMPTY`(409)，用户层返回 `USER_SCOPE_PROTECTED`(400)，缺 `confirm` 返回 `CONFIRMATION_REQUIRED`(400)。删除后绑定中的会话再次写入记忆会重建 `PROJECT.md`，项目作为空项目重新出现。

## 验证

- `npm run check`：typecheck + **112 项**单测 + 构建（0.7.0 为 106）。
- `npm run test:host`：真实宿主契约，新增真实路由上的 remove（`PROJECT_NOT_EMPTY` 409、缺确认 400、用户层 400、清空后 200；删除后 `groups` 与 `projects()` 都不再列出该项目，同级项目保留）。
- `npm run test:compat`：RC `0.2.0-rc.2` 与 Alpha `0.2.1-alpha.1` 双双通过。
- `node tests/ui-browser.mjs`：有记忆时按钮禁用 → 清空后解锁 → 取消不删 → 确认后侧栏不再列出并回落到用户层；截图 `release/ui/remove-dialog-light.png`、`remove-after-light.png`。
- `node tests/desktop-browser.mjs`：打到运行中的真实 GUI，结果 JSON 记 `removeProject: true`；另存 `release/ui/desktop-installed-remove.png`，即真实 GUI 上的入口与确认弹窗。
- 产物核对：`node_modules/dsh-md-memory/package.json` 版本 0.8.0；`lib/index.js`、`lib/core.js`、`lib/client.js` 与仓库构建的 SHA-256 逐一相同；安装包里已有 `route("remove", ["POST"], …)` 与 `PROJECT_NOT_EMPTY`。

## ⚠️ 重启前 / 重启后的差别

- **客户端已经生效**：宿主按需重取客户端 bundle，刷新记忆页即加载 0.8.0 的界面——实测真实 GUI 上「删除记忆项目」按钮与弹窗都在（见 `desktop-installed-remove.png`）。
- **宿主侧仍是 0.7.0，直到重启 DSH**：管理接口只在进程启动时加载。实测当前进程 `POST /api/md-memory/remove`（不带 `confirm`，不可能删东西）返回 **404 not found**，同一进程 `GET /api/md-memory/groups` 仍是 200。因此重启前点「确认删除项目」会拿到接口 404；重启 DSH 后即可用。
- `release/ui/desktop-result.json` 的 `manualWriteOnly: true` 说明这个进程已经是 0.7.0 的宿主（0.7.0 安装后重启过），不是本次 0.8.0 的宿主——重启后重跑 `desktop-browser.mjs` 仍是 `true`。
