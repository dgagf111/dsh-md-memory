# dsh-md-memory

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

使用桌面版 DSH 的中文用户，在日常 Agent 对话之外查看和维护持久记忆。

## Product Purpose

把用户偏好与各项目的长期信息保存为 Markdown，提供清晰可控的召回、主动保存、后台提炼及人工管理。

## Operating Context

作为 DSH 内置侧边栏入口与主面板运行。用户已确认覆盖所有已记录项目和用户记忆，跟随 DSH 明暗主题。兼容 RC.2 和 Alpha.1。

## Capabilities and Constraints

- 查看、搜索、编辑、新建、停用和删除用户或指定项目的记忆。
- 项目由会话工作区派生，不依赖管理页当前是否有活跃 Agent。
- 索引放得下时完整注入，超限按相关性填充；正文按需召回。
- 页面提供召回范围、预算、后台提炼及日志配置。
- 插件持久数据只保存为 Markdown；配置为 SETTINGS.md。
- 更新与删除检查版本；维护日志不记录原始对话或正文。

## Product Principles

任务和状态先于装饰；操作反馈明确；保留用户编辑草稿；冲突和错误必须可见。
