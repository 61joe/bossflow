# Worktree 与实现阶段

## 隔离目录

BossFlow 默认在源仓库同级创建：

```text
.bossflow-worktrees/
└── <repository-name>/
    └── <run-id>/
```

对应分支为 `bossflow/run-<run-id>`。工作树和分支基于创建时记录的提交，后续恢复不会重新选择 HEAD。

## 脏工作区策略

默认策略为 `reject`：主工作区存在未提交修改时拒绝创建实现工作树。用户可以在明确选择后使用 `use-head`，该策略仍然只使用已提交的 HEAD，不会把未提交文件复制到实现工作树。

## 实现门禁

`ImplementationCoordinator` 只允许从 `plan_approval` 进入 `build`，并复用现有计划审批和 artifact hash 校验。实现器收到的上下文只包含隔离工作树路径、基线提交、已批准计划和批准路径。

执行前后会比较主工作区的 Git 状态、HEAD 和分支指纹，任何变化都会使实现失败。

## Coding Agent Adapter

Build 使用的 Worktree Implementer 由当前选择的 Coding Agent Adapter 创建。CLI 只负责选择
Adapter 和构造工作流；Codex prompt、`codex exec` 参数、`stdin`、超时、输出上限、取消信号和
失败脱敏都在 `packages/adapters/src/codex` 中实现。

Adapter 不推进阶段、不修改审批记录，也不执行 commit、push、merge 或 PR。Workflow、Worktree、
路径范围、验证、Review 和持久化仍由 BossFlow Core 与 CLI 组合控制。

## 变更与证据

实现完成后，系统收集：

- tracked 和 untracked 变更路径。
- 已批准范围内的完整文本或二进制 Diff。
- 敏感路径列表，不读取或复制敏感文件内容。
- 实现结果、变更路径、异常路径和 patch SHA-256。

运行目录中写入：

```text
implementation.json
implementation.md
implementation.patch
```

Diff 和实现笔记进入持久化前会执行共享敏感信息脱敏。超过 4 MiB 的 patch 会显式失败，不会静默截断。

### Coding Agent 失败证据

Adapter 不能只返回“进程失败”。非零退出、超时、取消、信号终止、启动失败和未知结果必须使用
统一的失败证据契约，并记录当前可用的退出码、信号、耗时和诊断摘要。诊断摘要同时保留开头与
结尾，中间省略时写入显式标记，避免长 Prompt 或启动日志挤掉真正的错误原因。

失败证据写入 `implementation.json` 和 `implementation.md`，并在持久化前脱敏。任何失败种类都会
阻断 Run；即使失败前已经修改了文件，也不能仅凭 Diff 或手工测试结果推断实现成功。

## 路径与恢复

- 任意变更路径必须位于批准路径范围内。
- 敏感文件变更、越界路径或 Implementer 返回 blocked 时，运行进入 `blocked`。
- 已存在 `implementation.json` 时，恢复不会再次调用 Implementer。
- 中断发生在实现完成前时，可复用已创建的 Worktree 和分支。

### Attempt 与历史证据

每个 Run 从 `attempt: 1` 开始。显式重试会递增 attempt 和 workflow revision。创建新 attempt
之前，Run Store 将仍对当前阶段有效的实现、Verification、Review 和 Summary 文件复制为
`attempt-<n>-<original-name>`，保留原始 SHA-256 并标记为已 superseded。

Retry claim 在单个 Run 锁内完成版本检查、证据归档和阶段迁移。两个并发请求只能有一个推进
attempt；进程中断时不会留下“旧 stage 但无 active evidence”的半提交状态。

`implementation.json`、`verification.json`、`review.json` 和 `summary.json` 等固定文件名
继续表示当前生效证据。恢复和审批只接受未被 superseded 的当前 artifact；历史文件可读取和
审计，但不能满足当前阶段恢复或当前 Review 审批。新 attempt 写入前必须先完成归档，固定文件名
随后由新证据原子替换。

## 清理与孤儿目录

`GitWorktreeManager` 提供显式清理、可选分支删除、受管 Worktree 列表和孤儿目录检测。清理不会自动执行；孤儿目录也只报告，不自动删除。

当前能力通过 Core API 暴露，CLI 命令与审批集成在后续 TASK 中接入。
