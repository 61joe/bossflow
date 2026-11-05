# Verification、Review 与 Summary

## 命令执行

验证命令通过 `execa` 的可执行文件与参数数组运行，不启用 Shell 拼接。每条命令记录：

- 命令 ID、退出码和开始/结束时间。
- 实际持续时间。
- 有界 stdout 和 stderr。
- 是否经过敏感信息脱敏。
- timeout、取消和输出上限诊断。

默认单个输出流上限为 1 MiB。命令 `cwd` 必须位于当前 Run 的活动 Worktree 内。
系统会按真实路径校验 `cwd`，防止通过符号链接逃逸 Worktree。显式传入的 secret
以及名称符合 `API_KEY`、`TOKEN`、`SECRET`、`PASSWORD` 等凭据语义的环境变量值会在持久化前精确脱敏。

## Verification 阶段

`VerificationCoordinator` 使用运行记录中已确认的验证命令：

1. 必需的 lint、typecheck、test、build 命令按顺序执行。
2. required 命令失败后立即停止后续命令。
3. optional 命令失败会记录，但不单独阻断流程。
4. 所有 required 命令通过后进入 `review`，否则进入 `blocked`。

运行目录写入：

```text
verification.json
verification.md
```

恢复时会校验 artifact SHA-256，并补齐未完成的阶段迁移。

## Review 阶段

Reviewer 接收已校验的 Specification、当前审批 Plan、有界 Diff 摘要和真实验证证据。
完整 patch 保留在 `implementation.patch`，模型上下文默认最多接收 64 KiB 的 Diff 摘要。
验证命令的唯一执行来源是 `run.json.projectProfile.verificationCommands`。Technical Plan
中的验证命令仅作为 advisory recommendations，不会隐式扩大执行权限。

Reviewer 还会收到明确的 verification context：

- `authoritativeCommands`：项目 profile 中确认的命令。
- `executedCommandIds`：实际产生验证结果的命令 ID。
- `advisoryPlanCommands`：Plan 建议但未被项目 profile 选中的检查。
- `missingRequiredCommandIds`：缺少真实证据的 authoritative required 命令。

Plan 建议的验证命令默认仍是 advisory。用户可以在 Plan approval 时通过重复的
`--verification <id>` 显式采纳当前 Plan 中的命令。采纳结果与当前 Plan 哈希绑定，并追加到
Run 的 authoritative verification set；未采纳的命令不会执行。采纳不会改变无 Shell 参数数组、
超时限制和 Worktree 内 `cwd` 校验。

缺少 required 证据时系统自动增加 P1 finding；Reviewer 的命令相关 finding 必须关联
`verificationCommandId`。系统会把关联 advisory 命令的 P0/P1 确定性降级为 P3，因此
advisory 未执行不能单独阻断流程。
Review 结果包含：

- P0–P3 findings。
- 每个验收标准的 covered、partial 或 missing 映射。
- unresolved finding ID。

如果任一验收标准没有被完整覆盖，系统自动增加 P1 finding，避免 Review 静默完成。
`covered` 和 `partial` 映射必须包含 evidence。存在未解决的 P0/P1 时，Run 进入
`blocked`；否则进入 `review_approval`，等待人工批准外部操作。

Review 和 Summary 在持久化前再次执行敏感信息脱敏。

## Summary

Review 完成后生成：

```text
review.json
review.md
summary.json
summary.md
```

Summary 包含完成的任务、验证结果、Review findings、计划风险和待执行的人工审批动作。

## 恢复

Verification 和 Review artifact 都带有 SHA-256。阶段迁移失败或进程中断后，恢复流程会：

1. 校验 Review、Verification 和 Summary artifact 内容未被修改。
2. 确认 artifact 属于当前 Run。
3. 如果进程在 Review 与 Summary 之间中断，从已校验的 Review、Plan 和 Verification 重建缺失或过期的 Summary。
4. 根据持久化结果恢复 `review`、`blocked` 或 `review_approval` 阶段。
5. 避免重复执行已经完成的阶段。
