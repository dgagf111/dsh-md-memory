# 0.2.2 管理接口修复

2026-10-09，已通过官方 CLI 安装至 `C:\Users\89123\.dsh\profiles\desktop`，磁盘上的插件版本确认是 0.2.2。等待桌面重启加载升级代码，再运行实际桌面页面验收。

## 原因与修复

旧版为 `/api/md-memory/settings` 分别注册 GET、POST，但 DSH Connection 的 exact Fetch registry 按路径唯一注册，第二次注册抛出冲突。Cordis 随后卸载管理子 fiber，撤销之前注册的接口；客户端收到 404 `not found` 后直接解析 JSON，产生用户报告的错误。

新版将同一路径的两种方法合并注册。增加管理启动失败的 Markdown 日志 `management.registration_failed`，保留异常抛出；客户端对于非 JSON 的 HTTP 错误显示接口名、状态码与响应摘要。

## 验证

- 43 项单元测试、类型检查与构建通过。
- 新增真实 HostConnectionService 的宿主测试，覆盖完整插件加载及配置 GET/POST、分组 GET。
- 使用已安装的 0.2.1 运行新增宿主测试，稳定复现 `exact Fetch route ... is already registered`。
- 浏览器交互测试也改用真实 HostConnectionService，编辑、停用、删除、配置保存以及窄屏布局通过。
- 最终安装包分别安装到 RC 0.2.0-rc.2 / Cordis 4.0.4 与 Alpha 0.2.1-alpha.1 / Cordis 4.0.5-alpha.1，类型及宿主测试通过。

包：`dsh-md-memory-0.2.2.tgz`，152716 字节。

SHA-256：`9f526100e04f498bb7ba412e07e6c066a61aebdb702c3de992111932cc0273ad`。

实际桌面验收：`node tests/desktop-browser.mjs`。认证仅在内存中使用，不写入产物。
