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

## 变更与证据

实现完成后，系统收集：

- tracked 和 untracked 变更路径。
- 已批准范围内的完整文本或二进制 Diff。
- 敏感路径列表，不读取或复制敏感文件内容。
- 实现结果、变更路径、异常路径和 patch SHA-256。

运行目录中写入：

```text
implementation.json
implementation.patch
```

Diff 和实现笔记进入持久化前会执行共享敏感信息脱敏。超过 4 MiB 的 patch 会显式失败，不会静默截断。

## 路径与恢复

- 任意变更路径必须位于批准路径范围内。
- 敏感文件变更、越界路径或 Implementer 返回 blocked 时，运行进入 `blocked`。
- 已存在 `implementation.json` 时，恢复不会再次调用 Implementer。
- 中断发生在实现完成前时，可复用已创建的 Worktree 和分支。

## 清理与孤儿目录

`GitWorktreeManager` 提供显式清理、可选分支删除、受管 Worktree 列表和孤儿目录检测。清理不会自动执行；孤儿目录也只报告，不自动删除。

当前能力通过 Core API 暴露，CLI 命令与审批集成在后续 TASK 中接入。
