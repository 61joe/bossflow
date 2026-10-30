# BossFlow 技术选型基线

| 项目     | 内容             |
| -------- | ---------------- |
| 文档版本 | v0.1             |
| 更新日期 | 2026-10-30       |
| 主要语言 | TypeScript       |
| 运行环境 | Node.js 当前 LTS |
| 包管理器 | pnpm workspace   |

当前锁定并验证的工具链基线：

- Node.js `24.22.1`
- pnpm `12.16.1`
- TypeScript `6.0.3`

TypeScript 暂不升级到 7.x，因为当前 `typescript-eslint` 和 `ts-jest` 的 peer 范围尚不支持。升级 TypeScript 前必须先确认 ESLint 与 Jest 的兼容版本。

## 1. 选型结论

BossFlow 采用“核心编排协议 + 多种 Coding Agent Adapter”的结构。TypeScript 核心负责工作流、数据契约、工具边界和运行记录；Codex 等 Coding Agent 只作为入口与执行适配层，不能成为核心业务不可替换的一部分。

```text
packages/
├── core/
│   ├── agents/
│   ├── schemas/
│   ├── workflow/
│   ├── tools/
│   └── run-store/
├── cli/
└── adapters/
    ├── shared/
    └── codex/
```

后续新增 Claude Code、Cursor 或其他 Coding Agent 时，在 `packages/adapters/` 下增加独立 Adapter。核心包不依赖任何具体 Adapter。

## 2. 运行依赖

| 分类         | 选型                | 用途                                                                |
| ------------ | ------------------- | ------------------------------------------------------------------- |
| Agent 运行时 | `@openai/agents`    | Agent、工具、handoff、agents-as-tools、tracing、审批中断和 MCP 接入 |
| 数据契约     | `zod`               | 配置、计划、任务、工具参数和结构化输出的运行时校验                  |
| CLI          | `commander`         | `run`、`resume`、`approve`、`inspect` 等命令                        |
| 终端交互     | `@inquirer/prompts` | 初始化、范围确认和人工审批                                          |
| 子进程       | `execa`             | 执行测试、Lint、构建和受控 Shell 命令                               |
| Git          | `simple-git`        | Git 状态、Diff、分支和 Worktree 操作                                |
| 文件扫描     | `fast-glob`         | 扫描源码、配置、测试和项目清单                                      |
| 配置解析     | `yaml`              | 读取 `.bossflow/config.yaml`                                        |
| 日志         | `pino`              | 结构化运行日志、错误和阶段耗时                                      |
| 环境变量     | `dotenv`            | 从本地 `.env` 加载 CLI/Adapter 所需环境变量                         |

模型档案、OpenAI-compatible Endpoint 和 API Key 的隔离规则见 [模型配置与凭据管理](./MODEL_CONFIGURATION.md)。

文件系统、路径、哈希、随机标识和取消信号优先使用 Node.js 原生模块：

- `node:fs/promises`
- `node:path`
- `node:crypto`
- `AbortController` / `AbortSignal`

不额外引入 `uuid`、`lodash` 或 `date-fns`。

## 3. 开发与质量工具

| 分类                 | 选型                     | 用途                                     |
| -------------------- | ------------------------ | ---------------------------------------- |
| TypeScript 运行      | `tsx`                    | 本地运行和调试 TypeScript CLI            |
| 单元/集成测试        | `jest`                   | 工作流、Schema、工具和 Adapter 测试      |
| TypeScript 测试转换  | `ts-jest`                | 在 Jest 中编译并执行 TypeScript          |
| Jest 类型            | `@types/jest`            | Jest 全局 API 类型                       |
| Lint                 | `eslint`                 | JavaScript/TypeScript 静态检查           |
| ESLint 基础配置      | `@eslint/js`             | ESLint 官方推荐规则                      |
| TypeScript Lint      | `typescript-eslint`      | TypeScript Parser 与规则                 |
| Node 全局变量        | `globals`                | 正确声明 Node 环境全局对象               |
| 格式化               | `prettier`               | 代码、Markdown、JSON 和 YAML 格式化      |
| ESLint/Prettier 协调 | `eslint-config-prettier` | 关闭与 Prettier 冲突的格式类 ESLint 规则 |
| Node 类型            | `@types/node`            | Node.js API 类型                         |

TypeScript 编码规范、模块边界和 ESLint/Jest 落地约定见 [TypeScript 代码风格与工程约束（初稿）](./TS_STYLE_GUIDE.md)。

### ESLint 与 Prettier 边界

- ESLint 负责代码正确性、类型相关约束和项目规则。
- Prettier 独占代码格式。
- 不使用 `eslint-plugin-prettier` 把格式错误作为 ESLint 错误。
- 使用 `eslint-config-prettier` 关闭冲突规则。
- 使用 ESLint flat config，建议配置 `typescript-eslint` 的 type-aware rules。
- 第一次提交前确定 Prettier 格式，避免后续大范围格式 Diff。

### Jest 与 ESM 边界

项目从第一天采用 ESM：

```json
{
  "type": "module"
}
```

Jest 使用 `ts-jest` 的 ESM 配置，并在测试脚本中启用 Jest 的 ESM 运行支持。需要同时满足以下要求：

- TypeScript 使用 `NodeNext` 模块策略。
- Jest 测试环境与生产环境一致，均为 ESM。
- 不为了兼容 Jest 把核心代码退回 CommonJS。
- 覆盖率使用 Jest 内置 coverage，不额外引入第二套测试或覆盖率框架。

`@openai/agents`、Jest、ts-jest 和 Node.js 版本之间的 ESM 兼容性是初始化阶段必须优先验证的技术风险。

## 4. 环境变量策略

`dotenv` 只允许在进程入口加载，例如 CLI 或 Adapter 的启动文件：

```typescript
import 'dotenv/config';
```

加载后的环境变量必须经过 Zod 校验，再转换为显式的配置对象，注入 Workflow Core。核心包不得在模块导入时隐式读取 `process.env`。

建议文件：

```text
.env                 # 本地私有，不提交
.env.example         # 字段说明，不包含真实密钥
```

必须至少定义：

```dotenv
OPENAI_API_KEY=
OPENAI_MODEL=
BOSSFLOW_LOG_LEVEL=info
```

日志、运行摘要、错误信息和 Trace 均不得输出 API Key、完整环境变量或用户密钥。

## 5. 依赖边界

```text
Codex Skill / CLI / Future Adapters
                 ↓
          Workflow Core
     ┌───────────┼────────────┐
     ↓           ↓            ↓
 Agents SDK   Tool Adapters  Run Store
     ↓           ↓            ↓
  OpenAI API  Git/Shell/Files  JSON/MD/YAML
```

- `core/agents`：允许依赖 `@openai/agents` 和 Zod。
- `core/workflow`：负责阶段、审批、重试和恢复，不直接依赖具体 CLI。
- `core/tools`：封装 `execa`、`simple-git` 和文件扫描。
- `core/run-store`：保存 JSON、Markdown 和 YAML，不依赖 Agents SDK。
- `cli`：负责参数、交互、`dotenv` 和终端输出。
- `adapters`：负责不同 Coding Agent 的启动方式、上下文转换和结果回收。

## 6. 暂缓引入

- LangChain、LangGraph：避免与 OpenAI Agents SDK 形成双重编排。
- Prisma、Drizzle、PostgreSQL：MVP 先使用文件型 Run Store。
- Redis、BullMQ、Temporal：尚无分布式或长任务队列需求。
- 向量数据库和 RAG 框架：优先读取真实仓库与 Git Diff。
- `eslint-plugin-prettier`：避免格式检查与质量检查混杂。
- Vitest：项目已明确使用 Jest，不再并行维护测试框架。
- Turborepo：包数量较少时，pnpm workspace 足够。

出现明确的持久查询、多人协作、远程执行或跨天恢复需求后，再基于实际瓶颈增加数据库、队列或可观测性平台。
