# CLI 受控工作流

## 启动运行

默认 `run` 会生成 Specification 和 Technical Plan，然后停在计划审批门禁：

```text
bossflow run "增加导出功能" --confirm-project
```

只生成 Specification 时使用：

```text
bossflow run "增加导出功能" --confirm-project --stop-after spec
```

运行产物位于 `.bossflow/runs/<run-id>/`。计划审批前不会创建实现 Worktree。

## 查看状态

```text
bossflow status <run-id>
```

状态输出包含当前阶段、审批记录、artifact 路径、验证状态、Review 未决项和下一步命令。
artifact 内容读取后会校验 SHA-256，被修改的产物不会用于恢复。

## 审批门禁

批准当前 Specification 与 Plan revision：

```text
bossflow approve <run-id> --gate plan
```

Review 通过后，可以使用重复的 `--action` 仅授权明确请求的外部动作：

```text
bossflow approve <run-id> --gate review --action commit --action pr
```

允许的动作只有 `commit`、`push`、`merge` 和 `pr`。审批不会自动执行这些动作。
`--actor` 与 `--note` 可选，用于记录审批人和说明。

## 恢复运行

```text
bossflow resume <run-id>
```

恢复从第一个未完成阶段开始：

1. `spec`：生成 Plan 并停在 `plan_approval`。
2. `plan_approval`：没有有效 Plan approval 时拒绝进入 Build。
3. `build`：通过隔离 Worktree 中的 Codex Coding Agent 执行实现。此阶段使用 Codex CLI
   自身配置的模型和认证，不使用 BossFlow 的推理模型档案。
4. `verify`：执行项目确认的验证命令。
5. `review`：执行独立 Review 并生成 Summary。
6. `review_approval`：没有 Review approval 时不会标记完成。

已完成的 artifact 和阶段不会重复执行。`blocked` 与 `failed` 运行必须通过状态和证据定位原因，
不会被恢复命令静默绕过。

## 退出码

| 退出码 | 含义                               |
| ------ | ---------------------------------- |
| `0`    | 命令成功或按预期停在人工门禁       |
| `1`    | 未分类的运行时错误                 |
| `2`    | CLI 参数或用法错误                 |
| `3`    | Run 不存在或 Run ID 无效           |
| `4`    | 当前门禁未批准或阶段不允许该操作   |
| `5`    | Run 被验证、Review 或实现结果阻断  |
| `6`    | Run 失败或 artifact 完整性校验失败 |
| `7`    | 缺少当前阶段必需的 artifact        |

错误输出会附带可执行的恢复命令，例如补做审批或运行 `bossflow status` 查看证据。
