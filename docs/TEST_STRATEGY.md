# BossFlow 测试策略

| 项目     | 内容                           |
| -------- | ------------------------------ |
| 更新日期 | 2026-11-03                     |
| 测试框架 | Jest + ts-jest，ESM 模式       |
| 覆盖率   | 四项全局指标均为 100%          |
| 外部依赖 | 常规测试禁止网络和付费模型调用 |

## 1. 测试层级

- 单元测试放在被测模块同级的 `__tests__/` 中，验证 Schema、状态迁移、权限、脱敏、路径范围、恢复和幂等性。
- 跨包集成测试位于 `tests/integration/`，组合 Core、CLI、真实 Git worktree 和真实命令执行。
- 真实模型 smoke 使用 `pnpm smoke:model`，用于人工发布前检查模型调用链路，不进入 CI。

Jest 的覆盖率门槛为 statements、branches、functions 和 lines 全部 100%。新增生产代码必须同时增加行为和分支测试。

## 2. 仓库夹具

集成测试通过临时目录创建真实 Git 仓库，结束后在 `finally` 中删除仓库和 worktree。

| 场景                   | 用途                                           |
| ---------------------- | ---------------------------------------------- |
| `clean`                | 验证完整受控闭环和主工作区不变                 |
| `dirty`                | 验证项目上下文识别和脏工作区拒绝               |
| `multi-package`        | 验证 monorepo 语言和多包结构识别               |
| `missing-command`      | 验证缺失 lint/typecheck/test/build 命令的歧义  |
| `failing-verification` | 验证真实命令失败后阻断 Review 并持久化失败证据 |

复用的动态夹具位于 `tests/integration/support/repository-fixtures.ts`。测试不提交嵌套 `.git`
目录，也不依赖开发者机器上的仓库状态。

## 3. Fake Runtime

`tests/integration/support/fake-workflow-runtime.ts` 提供确定性的 Specification、Plan、
Implementer 和 Review。其默认 `ModelProvider.getModel()` 会直接抛错，确保常规测试不会意外
访问模型服务。

fake Coding Agent 位于 `scripts/fixtures/fake-codex.mjs`。真实模型 smoke 中只有 Coding Agent
使用 fake 实现；Specification、Plan 和 Review 仍调用所选模型档案。

## 4. 自动化覆盖

| TASK 8 要求      | 自动化证据                                                                 |
| ---------------- | -------------------------------------------------------------------------- |
| 8.1 仓库夹具     | `tests/integration/controlled-workflow.test.ts`                            |
| 8.2 Fake runtime | `tests/integration/support/fake-workflow-runtime.ts`                       |
| 8.3 单元测试     | 各模块 `__tests__/` 中的 contracts、workflow、implementation、redaction 等 |
| 8.4 完整闭环     | `controlled-workflow.test.ts` 的完整 Spec → Summary 场景                   |
| 8.5 失败场景     | `tests/integration/workflow-failures.test.ts` 及既有恢复/失败测试          |
| 8.6 主工作区不变 | 完整闭环前后比较 main HEAD、branch、status 和 tracked files                |

## 5. 常规验证

```text
pnpm check
pnpm spec:validate
```

`pnpm check` 依次执行格式检查、Lint、类型检查、Jest coverage 和生产构建。

## 6. 真实模型 Smoke

先确保当前项目 `.bossflow/config.yaml` 中存在目标模型档案，并通过环境变量或
`.bossflow/credentials.local.yaml` 提供凭据：

```text
pnpm smoke:model
pnpm smoke:model -- openai
```

默认使用 `deepseek`。脚本会：

1. 创建一次性 Git 仓库并安装仓库外的 fake `codex`。
2. 使用真实模型生成 Specification、Technical Plan 和 Review。
3. 在隔离 worktree 中执行 fake 实现。
4. 执行仓库提供的真实 lint、typecheck、test 和 build 命令。
5. 读取 `run.json`，只有 `stage=completed` 且 verification 通过时报告成功。
6. 删除临时仓库、fake binary 和 worktree 根目录。

2026-11-03 基线结果：`deepseek`，`stage=completed`，4 个验证命令通过，Review findings 为 0。

## 7. 当前限制

- 真实模型 smoke 不在 CI 中运行，避免网络不稳定、凭据缺失和模型费用进入常规流水线。
- Technical Plan 的验证命令目前作为建议展示；实际执行以持久化项目 profile 为准。
- Smoke 验证真实推理 Agent 与工作流编排，但不验证真实 Codex CLI 的代码生成质量。
