# BossFlow

BossFlow 是一个面向个人开发者的 AI 开发编排层。当前脚手架提供 TypeScript 工作流核心、可扩展 Coding Agent Adapter 和最小 CLI 闭环。

## 环境要求

- Node.js 24+
- pnpm 12+

## 安装

```text
pnpm install
cp .env.example .env
```

在 `.env` 中填写 `OPENAI_API_KEY`。真实密钥不会提交到 Git。

项目级 `$bossflow` Skill 可以通过 CLI 安装到目标项目：

```text
bossflow adapter install codex
```

使用 `--project <path>` 指定其他项目。默认不会覆盖同名的不同 Skill；确认后可显式传入 `--overwrite`。`@bossflow/adapters` 同时提供幂等的 `installCodexSkill()` / `CodexAdapter.installSkill()` API。

## 常用命令

```text
pnpm check
pnpm build
pnpm test
pnpm test:coverage
pnpm lint:staged
pnpm spec:list
pnpm spec:validate
```

构建后可以直接运行 CLI：

```text
node packages/cli/dist/bin.js doctor
node packages/cli/dist/bin.js init
node packages/cli/dist/bin.js adapter install codex
node packages/cli/dist/bin.js model list
node packages/cli/dist/bin.js run "增加一个导出功能"
node packages/cli/dist/bin.js status <run-id>
node packages/cli/dist/bin.js approve <run-id> --gate plan
node packages/cli/dist/bin.js resume <run-id>
```

`run` 默认在 `.bossflow/runs/<run-id>/` 中生成 Specification 和 Technical Plan，然后停在计划审批门禁。使用 `--stop-after spec` 可以保留只生成规格的模式。审批计划后，`resume` 会在隔离 Worktree 中执行实现、验证和 Review，并停在 Review 审批门禁。

完整的命令、审批动作和退出码见 [CLI 受控工作流](docs/CLI_WORKFLOW.md)。

## 模型和凭据

项目配置支持多个模型档案：

```text
node packages/cli/dist/bin.js model add local \
  --kind openai-compatible \
  --model coding-model \
  --base-url http://localhost:11434/v1 \
  --api-key-env LOCAL_MODEL_API_KEY \
  --default
```

API Key 不写入 `config.yaml`，也不通过命令行参数传入：

```text
node packages/cli/dist/bin.js auth set local
node packages/cli/dist/bin.js auth status
node packages/cli/dist/bin.js run "增加导出功能" --profile local
```

安全使用的完整说明见 [模型配置与凭据管理](docs/MODEL_CONFIGURATION.md)。

## 项目上下文和验证命令

`bossflow run` 会在调用模型前识别 Git 根目录和工作区状态、包管理器、语言、框架、项目约定、测试配置及验证脚本。精简后的项目档案会写入对应运行的 `run.json`。

默认要求检测 `lint`、`typecheck`、`test` 和 `build`。缺少必要命令或包管理器存在歧义时，命令会拒绝运行并列出原因。确认检测结果后可以显式传入：

```text
node packages/cli/dist/bin.js run "增加导出功能" --confirm-project
```

也可以在 `.bossflow/config.yaml` 中固定命令和超时：

```yaml
workflow:
  verification:
    requiredCommands:
      - lint
      - typecheck
      - test
      - build
    defaultTimeoutMs: 120000
    commandOverrides:
      test:
        command: pnpm
        args:
          - run
          - test
        timeoutMs: 300000
```

完整说明见 [项目上下文与验证命令](docs/PROJECT_CONTEXT.md)。

## 隔离实现

Core 提供基于 Git Worktree 的实现协调层。默认拒绝在脏主工作区创建实现工作树，实现完成后校验批准路径、采集完整 patch、敏感路径和实现结果，并持久化 `implementation.json` 与 `implementation.patch`。

恢复已完成的实现不会再次调用 Implementer；Worktree 清理和孤儿目录检测需要显式调用，不会自动删除用户文件。

完整说明见 [Worktree 与实现阶段](docs/WORKTREE_IMPLEMENTATION.md)。

## Verification、Review 与 Summary

实现完成后，BossFlow 在隔离 Worktree 中按顺序执行已确认的验证命令，持久化真实退出码、耗时和有界输出。必需命令失败会阻断流程，成功则进入独立 Review。

Review 会核对 Specification、批准 Plan、实现 Diff 和验证证据，并把每个验收标准映射到覆盖状态。未解决的 P0/P1 会阻止 Review 完成。最终生成 `review.md`、`summary.json` 和 `summary.md`，列出证据、风险与待人工批准的外部动作。

完整说明见 [Verification、Review 与 Summary](docs/VERIFICATION_REVIEW.md)。

## 项目结构

```text
packages/
├── core/       # 工作流、Schema、Run Store 和 Agent 运行时
├── adapters/   # Codex 等 Coding Agent 的接入层
└── cli/        # bossflow 命令
```

## 文档

- [产品需求](docs/PRD.md)
- [技术选型](docs/TECH_STACK.md)
- [TypeScript 代码规范](docs/TS_STYLE_GUIDE.md)
- [模型配置与凭据管理](docs/MODEL_CONFIGURATION.md)
- [项目上下文与验证命令](docs/PROJECT_CONTEXT.md)
- [Worktree 与实现阶段](docs/WORKTREE_IMPLEMENTATION.md)
- [Verification、Review 与 Summary](docs/VERIFICATION_REVIEW.md)
- [CLI 受控工作流](docs/CLI_WORKFLOW.md)

Agents SDK 的实现参考 [OpenAI 官方文档](https://developers.openai.com/api/docs/guides/agents-sdk)。

## OpenSpec

项目已初始化 OpenSpec 和 Codex 集成。当前行为契约位于 `openspec/specs/`，已完成变更历史位于 `openspec/changes/archive/`。

```text
pnpm spec:list
pnpm spec:validate
```

新行为变更应先使用 OpenSpec 创建 proposal、spec 和任务，再实现和归档。OpenSpec 项目上下文与 artifact 规则位于 `openspec/config.yaml`。

## Git Hooks

项目使用 Husky 管理 `.husky/` hooks。`pre-commit` 会执行：

```text
pnpm guard:branch
pnpm lint:staged
pnpm typecheck
pnpm spec:validate
```

暂存的 TypeScript、JavaScript、JSON、Markdown 和 YAML 文件会由 lint-staged 自动修复和格式化；完整测试与构建仍由 `pnpm check` 或 CI 执行。

`pre-push` 会拒绝直接推送 `main` 或 `master`。所有代码修改必须使用功能分支并通过 Pull Request 合并。

功能分支以 `feat-`、`fix-` 或 `chore-` 开头：

```text
git switch -c feat-<short-change-name>
git switch -c fix-<short-change-name>
git switch -c chore-<short-change-name>
```

`main` 分支启用服务器端保护：禁止直接推送、强制推送和删除，并要求通过 Pull Request。PR 必须通过 `Branch name policy` 检查才能合并。现有 lint、typecheck、单测和 build 工作流继续运行，但不作为合并阻断条件。

## CI

GitHub Actions 工作流位于 `.github/workflows/ci.yml`，在 `main` 分支推送、Pull Request 和手动触发时执行：

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

所有检查运行在一个 Linux Job 中，以减少 Actions 用量和总耗时。

`pnpm test` 默认执行覆盖率测试。Jest 对 statements、branches、functions 和 lines 均强制要求 100%，覆盖率不足时本地 `pnpm check` 和 CI 都会失败。

## Release PR

发布使用独立的 Changesets 发布 PR，不在普通功能 PR 合并时直接发布：

1. 功能 PR 必须包含 `.changeset/*.md` 版本说明。
2. 合并到 `main` 只累积待发布的 Changesets，不会自动创建发布 PR。
3. 需要发布时，从 `main` 手动运行 `Release PR` 工作流；该工作流创建或更新 `chore/release` 分支和 PR。
4. 发布 PR 合并后，`GitHub Release` 工作流运行完整检查、创建 `vX.Y.Z` Tag 和 GitHub Release。
5. 当前不执行 `npm publish`；npm Registry 发布将在包名、许可证和认证确定后单独启用。

本地添加 changeset：

```text
pnpm changeset
```

手动创建或更新发布 PR：

```text
gh workflow run release-pr.yml --repo 61joe/bossflow --ref main
```

`Release PR` 仅支持手动触发，普通 PR 合并不会启动该工作流。运行后会等待数秒，可通过以下命令查看执行状态：

```text
gh run list --repo 61joe/bossflow --workflow release-pr.yml --limit 1
```

发布 PR 自动化需要仓库 secret `RELEASE_PR_TOKEN`。使用仅授权当前仓库的 GitHub fine-grained PAT，并授予：

- Contents: Read and write
- Pull requests: Read and write

使用专用 token 是为了让自动创建的 `pull_request` 工作流能够触发 `Branch name policy` 和 CI；仓库内置 `GITHUB_TOKEN` 创建的 PR 事件不会再次触发普通 PR 工作流。
