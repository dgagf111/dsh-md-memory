# 0.5.3 安装记录

2026-10-09，本机 DSH Desktop 已安装 0.5.3。

- 安装包：`E:/project/dsh-md-memory/release/dsh-md-memory-0.5.3.tgz`
- SHA-256：`18bb9168a96724d26a749ea3a0d5df47c49f2a443ddaa3da2294f574f8d48ec6`
- 桌面 profile：`C:/Users/89123/.dsh/profiles/desktop`
- 安装命令：`pnpm add "file:E:/project/dsh-md-memory/release/dsh-md-memory-0.5.3.tgz" --ignore-scripts`
- 安装前配置备份：`C:/Users/89123/.dsh/backups/md-memory-0.5.3-20261009-202549`

包含本次审查的六项修复，详见 [修复记录](../docs/review-2026-10-09.md)。项目已通过 117 项测试、类型检查和构建；最终 0.5.3 安装包通过 RC 0.2.0-rc.2 与 Alpha 0.2.1-alpha.1 宿主契约测试。

安装后核对版本为 0.5.3，`lib/index.js`、`lib/client.js`、`lib/core.js` 和修复记录均与本次构建一致；安装目录中的插件入口可以成功导入。

完整测试 harness 不能直接套用桌面 profile：从项目运行会混用两套宿主依赖，从桌面运行则缺少测试所需的 PTC runtime。双版本契约测试在独立兼容环境中完成。

安装时 DSH 正在运行，尚未重启。宿主端修复须重启 DSH 后生效；未将安装文件验证视为重启后的运行验证。
