# 接口与验证

兼容矩阵核对于 2026-10-09：CLI 的 latest/next 为 `0.2.0-rc.2`，alpha 为 `0.2.1-alpha.1`。各组件的 npm latest 可能滞后，兼容脚本始终安装明确版本。

| DSH | Cordis | 源码基线 |
|---|---|---|
| 0.2.0-rc.2 | 4.0.4 | dsh-v0.2.0-rc.2 / 639ed015397290b3745d163aafe02ffee4aa3f84 |
| 0.2.1-alpha.1 | 4.0.5-alpha.1 | dsh-v0.2.1-alpha.1 / 5badb15009ae1756c3afe0ae0cef1faafc290ccc |

## 使用的公开接口

- Cordis 命名导出 apply/Config/inject；包包含 dsh.bundle.patch 安装元数据。
- `systemPrompt.section()`：固定行为纪律，关闭模板插值。
- `systemPrompt.context()`：动态索引与正文，作为宿主可记录的上下文快照。
- `agent/inbox/claimed`：在宿主组装上下文之前捕获本次真实用户输入。
- `system-prompt/assemble`：每次请求重新扫描、排名并更新本次组装的索引和正文；首次请求即可使用当前问题的召回。
- `tools.register(defineTool(...))`：规范 JSON 值与 Native 渲染，PTC 直接接收规范值。
- 0.7.0 起不再使用宿主的 `llm` 与 `sessionQuery` 服务，也不监听 `session/event`；后台提炼连同它需要的公开接口一起移除，插件不发起任何模型调用。

## 测试范围

单元测试共 106 项（9 个测试文件），检查排名、字节预算、中文与别名、零分索引填充、正文按需、冲突、人工编辑、敏感内容拒绝、事务恢复、遗忘、旧版 `state/` 检查点的清理及 Git worktree 身份。跨项目部分另测授权矩阵归一化与失效剔除、可见来源解析与 handle 冲突退化、被授权条目的预算护栏与链接渲染、多来源快照、`recallUser` 旧键迁移、0.7.0 已移除配置键的兼容读取与静默剥离，以及配置页保存时把每个项目写成显式矩阵。移动部分另测 user/项目之间任意互转的内容与 `created`/`revision` 保真、原范围历史清理与 tombstone 护栏、同名拒绝、同范围拒绝、陈旧拒绝，以及目标范围旧遗忘标记被显式移动清除。清空部分另测墓碑/修订/旧版 `state/` 检查点与其它产物一并删除、`PROJECT.md` 与空索引保留、其它作用域不受影响、清空后可继续写入。

宿主测试实际组装指定版本的 Cordis、AgentLoop、LLM、Session、SystemPrompt 与 ToolRuntime，用脚本化模型验证：插件加载、模型工具写入、下一步骤上下文刷新、跨会话共享、恢复去重、fork 继承排除和子 Agent 隔离。跨项目部分另验证：未授权项目读取被拒（`PROJECT_NOT_VISIBLE`）、保存授权后活动会话立即读到、`status.visibleSources` 与 `search`/`list` 覆盖被授权项目，以及带 `project` 的写入只落在当前项目。移动部分在真实注册的管理路由上验证 user→项目与项目→user、`REVISION_CONFLICT`（409）和 `SAME_TARGET`（400）。清空部分在真实注册的路由上验证缺确认标记与用户层目标都被拒（`CONFIRMATION_REQUIRED` / `USER_SCOPE_PROTECTED`，均 400），确认后 `groups` 里该项目为空、旧版 `state/` 检查点消失而 `PROJECT.md` 仍在。PTC 使用真实 run_code 分发桥和测试后端验证规范输出，不验证操作系统沙箱。

模型响应来自测试 adapter，不消耗用户模型额度；提示词在用户所选真实模型上的保存质量与成本需实际使用观察。断电耐久性没有单独验证。未知版本不自动扩大 peer 范围，每次扩展版本前重新执行这套矩阵。

0.7.0 的移除补充了：后台提炼的调度、检查点与辅助模型调用连同对应测试一起删除，测试数由 121 降到 106（删掉提取与提取恢复两个测试文件，新增旧配置键剥离与显式更新停用条目两项），插件不再发起任何模型调用。仍保留并继续验证此前审查的修复：源/目标索引更新失败及源提交后中断的移动恢复、恢复时人工编辑冲突、用户范围授权撤销后的直接读取拒绝、两个不同问题第一次实际模型请求的正文召回，以及损坏项目元数据后的权限保留。
