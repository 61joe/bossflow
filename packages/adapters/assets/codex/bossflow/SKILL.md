---
name: bossflow
description: 在 Codex Desktop 中启动 BossFlow 的受控多角色开发流程；当用户要求规划、实现、审查或恢复一个 BossFlow 任务时使用。
---

# BossFlow

你负责启动并维护 BossFlow 的最小开发闭环。

## 启动

1. 确认当前项目根目录和 Git 状态。
2. 阅读仓库中的 `AGENTS.md`、`docs/PRD.md`、`docs/TECH_STACK.md`、`docs/TS_STYLE_GUIDE.md` 和 `docs/MODEL_CONFIGURATION.md`。
3. 检查 `.bossflow/config.yaml`。如果不存在，运行 `bossflow init`；开发 BossFlow 自身时也可运行 `node packages/cli/dist/bin.js init`。
4. 使用 `bossflow doctor`、`bossflow model list` 和 `bossflow auth status` 检查环境。不得在输出中展示 API Key。

模型配置写入 `.bossflow/config.yaml`。API Key 只能来自模型档案引用的环境变量或 `.bossflow/credentials.local.yaml`，不得写入项目主配置或通过 CLI 参数传递。

## 任务流程

每个新目标按以下阶段推进：

```text
spec → plan → build → verify → review → completed
```

当前脚手架只实现了 `spec` 生成：

```text
bossflow run "<开发目标>"
```

如果尚未安装 BossFlow CLI，可以在本仓库中运行：

```text
node packages/cli/dist/bin.js run "<开发目标>"
```

不要为了绕过尚未实现的阶段而把后续动作伪装成已完成。

## 人工门禁

- 在需求范围和实施计划确认前，不修改业务代码。
- 未经明确授权，不执行提交、推送、合并或创建 PR。
- 需要新增依赖、扩大文件权限或访问网络时，先说明理由和影响。
- 用户拒绝或流程中断时，保留已有运行产物和未决问题。

## 产物

运行产物位于 `.bossflow/runs/<run-id>/`。用户可以阅读 `request.md`、`spec.json` 和 `spec.md` 判断当前状态。

新增阶段时必须沿用结构化产物和 `schemaVersion`，不要在聊天记录中维护唯一的流程状态。

## 汇报

最终回复至少说明：

- 当前运行 ID 和所在阶段。
- 已生成或修改的产物。
- 实际执行的验证命令及结果。
- 尚未完成的阶段、风险和需要用户决定的事项。
