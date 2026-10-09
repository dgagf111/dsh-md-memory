# 桌面版安装记录

- 安装时间：2026-10-09，香港时区。
- 桌面版：DeepSeek Harness 0.2.0-rc.2。
- 配置目录：`C:\Users\89123\.dsh\profiles\desktop`。
- 插件：`dsh-md-memory@0.1.0`。
- 安装包：`E:\project\dsh-md-memory\release\dsh-md-memory-0.1.0.tgz`。
- SHA256：`28195aee36e58f7382bf12aa5ee0ad80b0b5c827bad9819aea9b4059ad786157`。

通过桌面版自带的 `dsh plugin --profile desktop add <绝对安装包路径> --ignore-scripts` 安装。官方管理器自动选择 bundle 并热加载。随后通过正在运行的桌面版官方 `pluginManager` 接口检查，`include:md-memory` 为 `enabled: true`、`fiberPhase: active`。

旧的 `dsh-auto-memory@0.6.1` 已通过 `setBundleEnabled` 停用，返回 `application: applied`、`warnings: []`。旧包与 `C:\Users\89123\.dsh\memory` 下原有记忆保留，未迁移或删除。新插件使用独立目录，旧记忆不会自动进入新索引。

启用自动短索引召回、后台提取及详细日志；短索引预算 6144 字节，按需正文预算 12288 字节。桌面后台进程 57392 写入 `plugin.started` 日志，确认 `headless: false`、`autoExtract: true`、`autoRecall: true`。插件激活已完成工具和提示词注册，不需要重启桌面版。

- 新记忆目录：`C:\Users\89123\.dsh\md-memory`。
- 日志目录：`C:\Users\89123\.dsh\md-memory\logs`。
- 安装前配置备份：`C:\Users\89123\.dsh\profiles\desktop\.backup-md-memory-20261009`。

项目绑定从每个会话的 `session.header.cwd` 计算；本次没有创建真实模型对话或测试记忆。包本身的工作区绑定、六个工具、自动提取和上下文刷新已在 RC / Alpha 独立宿主验证，参见 `VALIDATION.md`。

pnpm 的 profile-only peer 检查会报告宿主提供的依赖缺失；实际桌面版解析了宿主模块并成功激活插件。本次没有额外安装一份宿主核心依赖。
