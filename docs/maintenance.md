# 维护与日志

## 从哪里检查

先调用 `md_memory_status`，查看 project、contextError、diagnostics、extraction。再到返回的 root 下读取 `logs/YYYY-MM-DD-pid.md`。每段 JSON 块是一条日志，包含时间、进程、事件、会话、项目、操作编号和相关统计。

默认记录启动、工作区绑定、写入、读取、搜索、提取开始/完成/失败、事务恢复。`debug: true` 额外记录索引 selectedIds、各条排名分数、字节预算和调度原因。日志不主动记录对话、模型输出或记忆正文；错误保留堆栈并过滤常见凭据格式。

日志文件不自动轮换删除。需要保留多久由用户决定，可在无运行实例时归档旧日期文件。

## 错误的含义

| code / 状态 | 处理 |
|---|---|
| REVISION_CONFLICT | 重新 read；比较当前正文再携带最新 revision/hash 更新、移动或删除。不要重复提交旧提案。 |
| NAME_CONFLICT | 目标范围已经有同名记忆。重命名目标或先删除它，移动不会覆盖已有条目。 |
| SAME_TARGET | 来源与目标是同一个作用域。换一个目标范围再移动。 |
| PROJECT_NOT_VISIBLE | 目标项目没有被当前项目授权。让用户在“配置 → 召回 → 跨项目访问”勾选；不要绕过授权直接读 `projects/` 目录。 |
| AMBIGUOUS_PROJECT | 传入的 handle 同时匹配多个项目。改用索引里打印的完整项目 id。 |
| COMMIT_INCOMPLETE | 正文可能已经保存，但事务尚未完成；检查日志和对应 transactions 文件。排除文件权限、占用或索引路径问题后恢复插件，会按同一操作重放。 |
| contextWarning | 写入已经提交；当次上下文刷新失败。检查状态与 context.failed 日志，无需重复保存正文。 |
| INVALID_MARKDOWN / INVALID_METADATA | 修复诊断指出的文件。坏文件排除召回，其他合法文件仍可使用。 |
| SENSITIVE_CONTENT | 删除凭据后重试。精确的最终 Markdown 在落盘前校验，人工编辑的文件在读取时检查。 |
| FORGOTTEN_MEMORY | 自动提案不能恢复忘记的条目；用户重新明确要求记住时设置 userRequested=true。 |
| LOCK_BUSY | 有进程持锁，或锁内容未写完整。等待短事务结束，查看持有者；插件不会抢占活进程的锁。 |
| STALE_LOCK | PID 已不存在。确认没有实例正在操作该作用域后，删除日志指出的 `.write-lock.md`，再恢复插件。 |
| RECOVERY_CONFLICT | journal 预期 hash 与人工改动冲突。比较 journal 的待写内容与现文件，人工确定保留哪版，然后处理该待提交 journal。 |
| NO_PROJECT / project=null | 检查 DSH 会话的工作目录。项目工具需要可靠 cwd，用户层仍可单独使用。 |
| NO_MODEL_ROUTE / NO_LLM_SERVICE | 选择会话模型或配置辅助 provider/model。显式读写与关键词搜索不调用模型。 |
| INVALID_EXTRACTION_JSON / EMPTY_EXTRACTION / EXTRACTION_FINISH | 辅助模型没有提供合格成功输出；检查 provider、模型和 finish reason。失败不会推进水位线。 |
| EXTRACTION_INPUT_TOO_LARGE | 新的未处理文本过大。压缩会话、拆分大输入，或让主 Agent 直接保存要点；插件不会偷偷跳过窗口来假装成功。 |
| RESUME_REQUIRES_SESSION_QUERY | 此自定义宿主缺少公开会话读取服务，无法恢复旧窗口；安装 sessionQuery 或在新会话使用。 |

操作前复制需要处理的 Markdown 文件，避免丢失原始证据。不要在 DSH 仍持有作用域锁时删除锁或修改 journal。

## 提取与恢复

提取按会话单飞；同一会话忙时将待执行任务合并到最新完成轮。输入只包含水位线后、该轮边界前的真实用户文本和未中断助手文本。插件注入、工具输出与 fork 继承段不作为新输入。

检查点只保存事件水位线和时间/错误信息，大小不随会话消息总数增长。全部操作提交后才推进；失败保留旧水位线，下一次成功轮或恢复会话重新处理。

辅助输入中的候选短清单预算为 32 KiB；按新增文本相关性带入的现有正文另有 32 KiB 预算。全库正文规模不会进入每次模型调用。输入总上限 128 KiB，输出总上限 128 KiB；候选清单显示覆盖数量。正文未提供的现有条目由主 Agent 通过 read 工具处理更新。

更新持作用域文件锁并比较 revision 与文件 hash。写入顺序为旧修订备份、journal、主题正文、生成索引、移除 journal。每个文件用同目录 `.pending-<uuid>.md` 临时文件和原子替换。Windows 占用造成的 rename 错误进行有限次重试，失败保留明确错误。

遗忘提交先写 tombstone，删除正文、修订及同名待提交副本。显式重新记住在同一 journal 恢复流程中清除 tombstone。不会主动删除宿主的会话文件。

移动在两个作用域上按路径顺序加锁，先写目标正文再释放原范围；目标写入成功后原范围提交失败时，会撤回刚写入的目标副本，避免留下两份。两次提交之间被强杀的进程仍可能留下两份，按 `memory.move_*` 日志人工确认真源后删除多余的一份。原范围复用同一条遗忘提交，因此移动后的旧范围同样拒绝后台写回。

## 模块职责

| 文件 | 职责 |
|---|---|
| src/runtime.ts | DSH 事件、上下文、六个工具、作用域绑定与已授权来源解析 |
| src/store.ts | Markdown 数据、修订、事务恢复、检查点、项目注册表 |
| src/access.ts | 跨项目授权矩阵的归一化、可见来源解析与项目 handle |
| src/files.ts | 文件读取、原子替换、作用域锁 |
| src/retrieval.ts | 分词、相关性、索引与正文预算 |
| src/extraction.ts | 单飞队列、增量窗口、提案提交 |
| src/completion.ts | 公开 LLM 调用、时限和成功终态 |
| src/prompts.ts | 主 Agent 与辅助提取提示词 |
| src/management.ts | 已认证的管理接口、跨项目浏览、页面编辑、移动与删除 |
| src/settings.ts | SETTINGS.md 的验证、旧键（`recallUser`）迁移、并发校验与持久化 |
| src/client/ | DSH 页面插槽、记忆编辑器与配置表单 |

改变接口或持久格式时先运行 `npm run check`、`npm run test:host`、`npm run test:compat`。兼容脚本在 `.compat/rc` 和 `.compat/alpha` 安装明确版本，不操作用户 profile。
