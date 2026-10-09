# 0.2.1 桌面版升级

- 桌面版：DSH 0.2.0-rc.2。
- 配置：`C:\Users\89123\.dsh\profiles\desktop`。
- 新安装包：`E:\project\dsh-md-memory\release\dsh-md-memory-0.2.1.tgz`。
- 安装前备份：`.backup-md-memory-ui-20261009`。
- 新插件继续使用 `C:\Users\89123\.dsh\md-memory`；旧 dsh-auto-memory 继续停用，旧记忆保留。

通过官方 CLI 安装到既有 desktop bundle。官方 PluginManager 的 installBundle 对已存在依赖返回 restart-required，必须重启桌面版才会装载新代码和客户端模块。已安装版本 0.2.1，当前后台仍运行此前版本，等待用户同意重启后进行实际侧边栏和配置页验收。

浏览器组件与真实存储/API 已通过完整交互验证；RC 与 Alpha 均实际安装最终包并通过宿主验收。独立审查修复了旧 operationId 导致编辑不保存、设置值/hash 快照不一致、保存期间新输入被响应覆盖三个问题。
