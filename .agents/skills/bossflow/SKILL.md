---
name: bossflow
description: 在 Codex Desktop 中启动、审批或恢复 BossFlow 的受控多角色开发流程；当用户要求规划、实现、审查或恢复 BossFlow 任务时使用。
---

# BossFlow

你负责启动并维护 BossFlow 的受控开发闭环。持久化状态和运行产物是事实来源，聊天记录不是。

## 启动检查

1. 确认当前项目根目录和 Git 状态。
2. 阅读存在的 `AGENTS.md`、README、OpenSpec 上下文、`docs/PRD.md`、`docs/TECH_STACK.md`、`docs/TS_STYLE_GUIDE.md` 和 `docs/MODEL_CONFIGURATION.md`。
3. 检查 `.bossflow/config.yaml`。不存在时运行：

   ```text
   bossflow init
   ```

   开发 BossFlow 自身时可使用：

   ```text
   node packages/cli/dist/bin.js init
   ```

4. 使用 `bossflow doctor`、`bossflow model list` 和 `bossflow auth status` 检查环境。
5. 不得输出 API Key、凭据文件内容或完整环境变量。

模型档案只控制 Specification、Plan、Review 和 Summary 推理 Agent。Build 阶段的模型和认证由 Coding Agent Adapter 管理。

## 新建运行

用户给出新目标时，优先运行：

```text
bossflow run "<开发目标>"
```

如果项目命令检测存在歧义，必须先展示歧义项并询问用户。用户明确接受后，才使用：

```text
bossflow run "<开发目标>" --confirm-project
```

只有用户明确要求仅生成规格时，才使用：

```text
bossflow run "<开发目标>" --stop-after spec
```

默认 `run` 会生成 `spec.md`、`spec.json`、`plan.md` 和 `plan.json`，然后停在 `plan_approval`。

## 读取和汇报状态

每次状态检查运行：

```text
bossflow status <run-id>
```

同时读取 `.bossflow/runs/<run-id>/run.json`。汇报必须使用其中真实的 `stage`、审批记录、artifact 和失败信息。

- 不得把 `plan_approval`、`review_approval`、`blocked` 或 `failed` 描述为已完成。
- 不得声称 Build、Verify 或 Review 已完成，除非对应 artifact 存在且 `run.json` 已进入后续阶段。
- 遇到 `blocked` 或 `failed` 时，报告最早未完成阶段、原因和用户需要执行的动作。

## 计划审批门禁

在 `plan_approval` 阶段，向用户展示 Specification、Plan、影响路径、风险和验证命令。

只有获得用户明确批准后，才运行：

```text
bossflow approve <run-id> --gate plan
```

然后运行：

```text
bossflow resume <run-id>
```

在 Plan approval 缺失、过期、artifact 哈希不匹配或 workflow revision 不匹配时：

- 不得修改业务代码。
- 不得创建或复用实现 Worktree。
- 不得调用会执行 Build 的命令。
- 要求用户重新检查并批准当前 Plan。

## Build、Verify 和 Review

`bossflow resume <run-id>` 会从首个未完成阶段继续：

```text
spec → plan → plan_approval → build → verify → review → review_approval
```

- Build 在隔离 Git Worktree 中执行。
- Verify 使用项目确认的真实命令。
- Review 读取 Specification、批准的 Plan、Diff 和验证证据。

不得为了推进流程而在主工作区手工补写代码、伪造测试结果或跳过失败命令。

## Review 审批与外部动作

进入 `review_approval` 后，先读取并展示：

- `review.md` 和 `review.json`
- `summary.md` 和 `summary.json`
- 未解决 findings
- 验收标准覆盖状态
- 待执行的外部动作

询问用户需要授权哪些动作。只允许：

- `commit`
- `push`
- `merge`
- `pr`

只把用户明确请求的动作传给：

```text
bossflow approve <run-id> --gate review --action <action>
```

可以重复 `--action`。在执行任何外部 Git 动作前，重新检查 `run.json`：

1. `review_approval` 阶段存在当前 workflow revision 的 Review approval。
2. Review approval 的 `artifactSha256` 与当前 `review.json` 一致。
3. 请求的动作存在于 `external-action` approval 的 `actions` 中。

缺少任一条件时不得执行外部动作。未获授权不得 commit、push、merge 或创建 PR。

执行外部动作时：

- 使用 `run.json.worktree.path` 中的隔离 Worktree，不得切换到或修改主工作区。
- 使用 `run.json.worktree.branch` 作为需要推送和创建 PR 的分支。
- 遵守目标仓库的 `AGENTS.md`、分支命名和 PR 模板规则。
- 只有显式授权包含 `merge` 时才允许合并。

所需外部动作完成，或用户没有请求任何外部动作时，运行：

```text
bossflow resume <run-id>
```

再次读取 `run.json`，确认 `stage=completed` 后才能报告完成。

## 完成条件

只有 `run.json.stage` 为 `completed` 时才能声称工作流完成。最终汇报至少包含：

- Run ID 和实际阶段。
- 已生成或修改的 artifacts。
- 真实验证命令和结果。
- Review findings 与验收覆盖。
- 授权和执行过的外部动作。
- 未完成事项、剩余风险和用户决定。
