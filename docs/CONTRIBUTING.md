# BossFlow 贡献指南

本文说明本地开发、分支、Pull Request、Git Hook、CI 和 OpenSpec 流程。发布步骤见
[发布流程](./RELEASE.md)。

## 开始之前

修改代码前至少阅读：

- [产品需求](./PRD.md)
- [技术选型](./TECH_STACK.md)
- [TypeScript 代码规范](./TS_STYLE_GUIDE.md)

行为变更还必须检查 `openspec/specs/`，并通过 OpenSpec change 描述 proposal、spec delta 和任务。

## 本地开发

环境要求：

- Node.js 24+
- pnpm 12+
- Git

安装依赖并构建：

```bash
pnpm install
pnpm build
```

常用命令：

```bash
pnpm dev
pnpm format
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check
pnpm spec:list
pnpm spec:validate
```

提交前必须通过：

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm spec:validate
```

也可以直接运行完整质量门禁：

```bash
pnpm check && pnpm spec:validate
```

`pnpm test` 默认执行 coverage。Jest 对 statements、branches、functions 和 lines 均强制要求 100%。

## 分支规范

禁止直接提交或推送 `main` 或 `master`。所有代码修改必须使用以下前缀之一：

```bash
git switch -c feat-<short-change-name>
git switch -c fix-<short-change-name>
git switch -c chore-<short-change-name>
```

`Branch name policy` 同时兼容 `feat/`、`fix/`、`chore/` 形式，但项目默认使用连字符形式。

`main` 分支启用服务器端保护，禁止直接推送、强制推送和删除。Pull Request 必须通过
`Branch name policy` 才能合并。

## Pull Request

创建 PR 前：

1. 确认工作区只包含本次任务相关改动。
2. 运行完整质量检查和 OpenSpec 校验。
3. 检查是否包含真实测试，而不是只修改实现或文档。
4. 行为变更包含对应 Changeset。

PR 描述使用 [PR 模板](./PR_TEMPLATE.md)，至少说明：

- 变更背景和目的。
- 主要改动。
- 实际执行的验证命令和结果。
- 已知风险、限制和后续工作。
- 需要 reviewer 重点检查的内容。

PR 不得自行合并。合并决定由维护者完成。

## Git Hooks

项目使用 Husky 管理 `.husky/` hooks。

`pre-commit` 执行：

```bash
pnpm guard:branch
pnpm lint:staged
pnpm typecheck
pnpm spec:validate
```

暂存的 TypeScript、JavaScript、JSON、Markdown 和 YAML 文件会由 lint-staged 自动修复和格式化。

`pre-push` 执行：

```bash
pnpm guard:push
```

它会拒绝直接推送 `main` 或 `master`。不要在未获明确授权时绕过 Husky 或使用 `--no-verify`。

## CI

GitHub Actions 工作流位于 `.github/workflows/ci.yml`，在 `main` Push、Pull Request 和手动触发时执行：

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

所有质量检查运行在一个 Linux Job 中。CI 使用 Node.js 24，并通过 frozen lockfile 安装依赖。

质量 CI 会持续验证代码质量，但当前合并门禁只要求 `Branch name policy`。

## OpenSpec

当前行为契约位于 `openspec/specs/`，已完成变更历史位于 `openspec/changes/archive/`。

```bash
pnpm spec:list
pnpm spec:validate
```

新行为变更应先创建 proposal、spec delta 和任务，再实现、验证和归档。OpenSpec 项目上下文和
artifact 规则位于 `openspec/config.yaml`。

## Review 关注点

提交 Review 前，优先自查以下高风险区域：

- 外部输入是否经过 Zod 校验。
- API Key、环境变量、命令输出和 Diff 是否可能进入日志或运行产物。
- Shell、Git 和文件路径是否保持参数化并限制在允许目录内。
- 取消、超时和失败是否被正确处理，而不是静默回退。
- Run 恢复是否校验 artifact 所有权和 SHA-256。
- 必需验证失败、P0/P1 Review finding 或缺少需求覆盖时是否会阻断流程。
- 新增外部副作用是否经过明确人工授权。

## Release

发布使用 Changesets 和独立 Release PR，不把发布步骤混入普通功能 PR。完整流程见
[发布流程](./RELEASE.md)。
