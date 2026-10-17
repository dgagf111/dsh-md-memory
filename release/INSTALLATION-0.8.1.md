# 0.8.1 安装记录（修复 0.2.1-rc.1 不兼容）

2026-10-17，本机 DSH Desktop **0.2.1-rc.1** 已安装 0.8.1。

- 安装包：`E:/project/dsh-md-memory/release/dsh-md-memory-0.8.1.tgz`（234,991 字节）
- SHA-256：`65691fb034d6dc216cc45b6c12bee68356e7c850f2569b08bf359c9f0eb02a56`
- npm shasum（sha1）：`0acfc6369b70fb41e040bdd7d57db3fa2c6a6ba7`
- 桌面 profile：`C:/Users/89123/.dsh/profiles/desktop`
- 依赖改动：`…release/dsh-md-memory-0.8.0.tgz` → `…release/dsh-md-memory-0.8.1.tgz`
- 安装方式：桌面端自带的 pnpm（`resources/runtime/primary-runtime/dependencies`）在 profile 目录执行
  `pnpm add "file:E:/project/dsh-md-memory/release/dsh-md-memory-0.8.1.tgz" --ignore-scripts`
- 安装前配置备份：`C:/Users/89123/.dsh/backups/md-memory-0.8.1-install-20261017-162914`（`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`）

## 问题

0.8.0 装在 0.2.1-rc.1 上时，宿主在装载阶段直接禁用整行：

```
dsh: warning: Plugin dsh-md-memory@0.8.0 is incompatible with dsh 0.2.1-rc.1:
requirements {"@deepseek-ai/dsh-agent":"0.2.0-rc.2 || 0.2.1-alpha.1", …}
```

原因是 0.8.0 的 peer 范围是精确版本枚举 `0.2.0-rc.2 || 0.2.1-alpha.1`，`0.2.1-rc.1` 不在其中。宿主兼容预检在没有 `engines.dsh` 时逐条检查这些 peer，任何一条不满足就禁用整行插件。结果：插件装上了、界面看不到，`/api/md-memory/*` 全部 404。

## 修复

- `engines.dsh: ">=0.2.0-rc.2 <0.3.0-0"`。宿主优先只看这一条，0.2 线上任何 rc/alpha/正式版都通过，`0.3.0-rc.1` 仍被拒绝。
- `peerDependencies` 由枚举改为 `^0.2.0-rc.2`（Cordis `^4.0.4`），让 npm 侧解析同样能落到 0.2.1-rc.1。
- 业务代码、数据格式、管理路由都没有改动；`lib/` 随版本号重新构建。

## 验证

- `npm run check`：typecheck + **112 项**单测 + 构建通过。
- `npm run test:host`：真实宿主契约通过（0.2.1-rc.1 依赖）。
- `npm run test:compat`：三列全绿 —— `0.2.0-rc.2` + Cordis `4.0.4`、`0.2.1-alpha.1` + `4.0.5-alpha.1`、`0.2.1-rc.1` + `4.0.5`。0.2.1 列额外装配 `workingDirectory` 与 `fs-local`（宿主把工作目录拆成服务后 `run_code` 才接受带 Agent 的调用）。
- 用宿主自己的 `evaluatePluginCompatibility()` 复核：0.8.1 在 `0.2.0-rc.2` / `0.2.1-alpha.1` / `0.2.1` / `0.2.1-rc.1` 上 `compatible`，在 `0.3.0-rc.1` 上 `incompatible`；同一函数对 0.8.0 在 `0.2.1-rc.1` 上仍报不兼容，确认这就是原故障。
- **实机验证**（不改动桌面 profile 之外的东西）：新建独立 profile `mdmemory-verify`（web 模板），用桌面端 `dsh plugin --profile mdmemory-verify add <tgz>` 安装，再以 `--port 19555` 启动 0.2.1-rc.1 宿主：
  - 启动无 `disabling profile plugin row` 告警；
  - `pluginManager/listPlugins` 中 `include:md-memory` 为 `enabled: true`、`fiberPhase: active`；
  - 记忆日志出现 `plugin.started` 与 `management.registered`（routes 8）；
  - `/api/md-memory/groups`、`/settings`、`/read?scope=user&…` 均 200；
  - Playwright 打开真实页面点「记忆」：`个人与项目` 标题出现，渲染 8 条条目，「配置」页的「跨项目访问」存在，**没有 pageerror**；
  - 启动图注入的 `__DSH_BOOT__` 里有 `dsh-md-memory` 客户端条目，说明客户端产物也被宿主接收。
- 桌面 profile 已升级到 0.8.1（`node_modules/dsh-md-memory/package.json` 版本 0.8.1，`engines.dsh` 与 peer 范围为新值）。

## ⚠️ 需要重启

宿主侧代码只在进程启动时加载。桌面端当前进程仍在运行旧版宿主，**重启 DSH 后**记忆页与工具才会用上 0.8.1 的声明；客户端 bundle 可以靠刷新页面重取。

如果重启后仍看到插件被禁用，检查 `~/.dsh/profiles/desktop/compatibility.json` 里是否残留针对 `dsh-md-memory@0.8.0` 的豁免记录——0.8.1 不需要任何豁免，必要时用插件管理界面撤销。
