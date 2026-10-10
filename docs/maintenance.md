# 维护与日志

## 从哪里检查

先调用 `md_memory_status`，查看 root、project、visibleSources、index、diagnostics、contextError、autoRecall。再到返回的 root 下读取 `logs/YYYY-MM-DD-pid.md`。每段 JSON 块是一条日志，包含时间、进程、事件、会话、项目、操作编号和相关统计。

默认记录启动、工作区绑定、写入、读取、搜索、配置保存、清空、事务恢复。`debug: true` 额外记录索引 selectedIds、各条总分与分项打分、字节预算。日志不主动记录对话、模型输出或记忆正文；错误保留堆栈并过滤常见凭据格式。

日志文件不自动轮换删除。需要保留多久由用户决定，可在无运行实例时归档旧日期文件。

## 错误的含义

| code / 状态 | 处理 |
|---|---|
| REVISION_CONFLICT | 重新 read；比较当前正文再携带最新 revision/hash 更新、移动或删除。不要重复提交旧提案。 |
| NAME_CONFLICT | 目标范围已经有同名记忆。重命名目标或先删除它，移动不会覆盖已有条目。 |
| SAME_TARGET | 来源与目标是同一个作用域。换一个目标范围再移动。 |
| PROJECT_NOT_VISIBLE | 目标项目没有被当前项目授权。让用户在“配置 → 召回 → 跨项目访问”勾选；不要绕过授权直接读 `projects/` 目录。 |
| SOURCE_NOT_VISIBLE | 当前项目没有用户记忆的读取授权。读取工具与索引、搜索、列表使用同一授权限制。 |
| AMBIGUOUS_PROJECT | 传入的 handle 同时匹配多个项目。改用索引里打印的完整项目 id。 |
| COMMIT_INCOMPLETE | 正文可能已经保存，但事务尚未完成；检查日志、对应 transactions 文件以及根目录 moves 文件。排除文件权限、占用或索引路径问题后恢复插件，会按同一操作重放。 |
| contextWarning | 写入已经提交；当次上下文刷新失败。检查状态与 context.failed 日志，无需重复保存正文。 |
| INVALID_MARKDOWN / INVALID_METADATA | 修复诊断指出的文件。坏文件排除召回，其他合法文件仍可使用。 |
| SENSITIVE_CONTENT | 删除凭据后重试。精确的最终 Markdown 在落盘前校验，人工编辑的文件在读取时检查。 |
| FORGOTTEN_MEMORY | 已遗忘的条目不会被任何后台流程写回；用户重新明确要求记住时设置 userRequested=true。 |
| LOCK_BUSY | 有进程持锁，或锁内容未写完整。等待短事务结束，查看持有者；插件不会抢占活进程的锁。 |
| STALE_LOCK | PID 已不存在。确认没有实例正在操作该作用域后，删除日志指出的 `.write-lock.md`，再恢复插件。 |
| RECOVERY_CONFLICT | journal 预期 hash 与人工改动冲突。比较 journal 的待写内容与现文件，人工确定保留哪版，然后处理该待提交 journal。 |
| NO_PROJECT / project=null | 检查 DSH 会话的工作目录。项目工具需要可靠 cwd，用户层仍可单独使用。 |
| INVALID_SETTINGS / Unknown setting | 只对真正未知的键报错。0.7.0 移除的 `autoExtract`、`extractionProvider`、`extractionModel`、`extractionTimeoutMs`、`extractionMaxTokens`、`extractionMaxOperations`、`extractionAttempts`、`enableInHeadless` 属于兼容旧键，读取与保存时静默剥离，不报错，下一次保存就从文件里消失。 |

操作前复制需要处理的 Markdown 文件，避免丢失原始证据。不要在 DSH 仍持有作用域锁时删除锁或修改 journal。

## 写入与恢复

0.6.0 及更早版本会在根会话成功结束一轮后发起后台提炼：独立调用会话的 provider/model 消化新增对话并写库，同时按会话维护 `state/` 检查点。0.7.0 已把这套机制整体移除——没有后台模型调用、候选清单、检查点或重试。现在记忆只在显式写入时变化：Agent 在同一轮调用 `md_memory_write` / `md_memory_forget`，或用户在记忆页手动保存、删除、移动。页面写入的 `source.kind` 是 `explicit-user`，Agent 工具是 `agent`。

`state/` 目录只是旧版本遗留物，不再被读写；`清空项目记忆` 会把它和其余产物一起删除，清空之后也不会有任何后台流程重新生成记忆。旧版本写下的 `source.kind: extraction` 记录仍被读取与更新（向后兼容），只是不再产生新的同类记录。

更新持作用域文件锁并比较 revision 与文件 hash。写入顺序为旧修订备份、journal、主题正文、生成索引、移除 journal。每个文件用同目录 `.pending-<uuid>.md` 临时文件和原子替换。Windows 占用造成的 rename 错误进行有限次重试，失败保留明确错误。

遗忘提交先写 tombstone，删除正文、修订及同名待提交副本。已遗忘的 name 不会被任何后台流程写回；只有显式重新记住（`userRequested=true`）才在同一 journal 恢复流程中清除 tombstone。不会主动删除宿主的会话文件。

移动先在根目录 `moves/<operation>.md` 保存跨范围事务，再按路径顺序锁定两个作用域，先写目标正文，再遗忘原范围。中途失败保留已有副本与移动 journal，修复故障后恢复插件或进行下一次写入会继续完成移动；源已删除时不会再撤回目标正文。恢复检查源与目标的内容是否被人工修改，遇到冲突停止并保留证据。原范围复用遗忘提交，因此移动后的旧范围保持遗忘状态，只有显式重新记住才会恢复。成功完成后清除移动 journal。

PROJECT.md 损坏的目录仍保留其显式读取限制和对它的授权引用。保存其他配置不会清除这些限制；修复项目元数据后原授权继续生效。

## 模块职责

| 文件 | 职责 |
|---|---|
| src/runtime.ts | DSH 事件、上下文、六个工具、作用域绑定与已授权来源解析 |
| src/store.ts | Markdown 数据、修订、事务恢复、项目注册表 |
| src/access.ts | 跨项目授权矩阵的归一化、可见来源解析与项目 handle |
| src/files.ts | 文件读取、原子替换、作用域锁 |
| src/retrieval.ts | 分词、相关性、索引与正文预算 |
| src/prompts.ts | 主 Agent 提示词（`MEMORY_POLICY`） |
| src/management.ts | 已认证的管理接口、跨项目浏览、页面编辑、移动与删除 |
| src/settings.ts | SETTINGS.md 的验证、旧键（`recallUser` 与 0.7.0 移除的后台提炼配置）的兼容剥离、并发校验与持久化 |
| src/client/ | DSH 页面插槽、记忆编辑器与配置表单 |

改变接口或持久格式时先运行 `npm run check`、`npm run test:host`、`npm run test:compat`。兼容脚本在 `.compat/rc` 和 `.compat/alpha` 安装明确版本，不操作用户 profile。
