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

项目级 `$bossflow` Skill 模板位于 `packages/adapters/assets/codex/bossflow/SKILL.md`。将其安装到目标项目的 `.agents/skills/bossflow/SKILL.md` 后，可以在 Codex Desktop 新聊天中显式唤起。

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
node packages/cli/dist/bin.js model list
node packages/cli/dist/bin.js run "增加一个导出功能"
```

`run` 当前完成最小闭环：在 `.bossflow/runs/<run-id>/` 中创建运行记录，然后通过 OpenAI Agents SDK 生成结构化规格 `spec.json` 和可读版本 `spec.md`。计划、实现、验证和审查阶段将在后续接入。

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

功能分支建议使用：

```text
git switch -c codex/<short-change-name>
```

私有仓库的服务器端 Ruleset / Branch Protection 需要 GitHub Pro；当前本地 Husky guard 是无额外订阅时的强制约束，GitHub Actions 仍作为 PR 验证门禁。

## CI

GitHub Actions 工作流位于 `.github/workflows/ci.yml`，在 `main` 分支推送、Pull Request 和手动触发时执行：

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

所有检查运行在一个 Linux Job 中，以减少私有仓库的 Actions compute 消耗。
