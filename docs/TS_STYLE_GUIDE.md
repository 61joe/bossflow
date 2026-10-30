# BossFlow TypeScript 代码风格与工程约束（初稿）

| 项目       | 内容                                           |
| ---------- | ---------------------------------------------- |
| 文档状态   | 草案，待项目初始化后通过 ESLint 和实际代码验证 |
| 适用范围   | `core`、`cli`、`adapters` 及测试代码           |
| 格式化工具 | Prettier                                       |
| 静态检查   | ESLint + typescript-eslint                     |
| 测试框架   | Jest + ts-jest                                 |

## 1. 核心原则

代码风格约束的目标不是追求形式统一，而是降低以下几类风险：

1. Agent 编排中的隐式状态和竞态条件。
2. Coding Agent 修改代码时产生难以审查的过大 Diff。
3. 外部模型输出、配置文件和工具参数绕过运行时校验。
4. 错误被吞掉、异步任务未等待或敏感信息进入日志。
5. 核心逻辑与具体 Coding Agent、CLI 或第三方 SDK 强耦合。

当规则冲突时，优先级为：

```text
正确性与安全性
    > 可读性与可维护性
    > 一致性与形式统一
    > 代码简短
```

## 2. TypeScript 基线

### 2.1 编译配置

所有包从第一天启用严格模式：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "useUnknownInCatchVariables": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

项目统一使用 ESM，不在核心代码中使用 CommonJS：

```json
{
  "type": "module"
}
```

在 TypeScript 的 NodeNext 模式下，相对导入使用输出后的 `.js` 扩展名：

```typescript
import { createRunStore } from './run-store.js';
```

### 2.2 类型安全

- 禁止显式 `any`。外部输入先视为 `unknown`，再通过 Zod 或类型守卫收窄。
- 不用类型断言掩盖不确定输入。确需断言时，应在紧邻位置说明不变量。
- 禁止 `@ts-ignore`。确有第三方类型缺陷时使用窄范围 `@ts-expect-error` 并注明原因。
- 不依赖 TypeScript 类型校验运行时数据。配置、模型输出、工具参数和 JSON 文件必须经过 Zod。
- 导出函数和跨包 API 显式声明返回类型；局部变量和内部回调可以依赖类型推导。
- 通过 `z.infer` 从 Zod Schema 推导领域类型，不重复手写同构类型。
- 使用 `import type` 导入仅用于类型的符号。

### 2.3 类型建模

对象契约优先使用 `interface`：

```typescript
interface RunRecord {
  readonly id: string;
  readonly status: RunStatus;
  readonly createdAt: Date;
}
```

联合类型、映射类型和组合类型使用 `type`：

```typescript
type RunStatus = 'spec' | 'plan' | 'build' | 'verify' | 'review' | 'completed' | 'blocked';
```

使用字符串字面量联合类型或 `as const` 对象，不新增传统 `enum`：

```typescript
const RunStatus = {
  Spec: 'spec',
  Plan: 'plan',
  Build: 'build',
} as const;
```

复杂状态和工具结果优先使用可穷尽检查的判别联合：

```typescript
type ToolResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly code: ToolErrorCode;
      readonly message: string;
    };
```

- 可选属性表示“不存在”，使用 `undefined`。
- `null` 只用于适配外部 API 或 SDK；进入核心领域模型前转换为 `undefined` 或显式状态。
- 对外暴露的数据契约默认使用 `readonly` 属性。
- 只读数组参数使用 `readonly T[]`，避免无意修改调用方数据。
- 避免多层 `Pick`、`Omit` 和条件类型。类型可读性比复用技巧更重要。

## 3. 模块、目录与导出

### 3.1 文件和目录命名

- 文件与目录使用 `kebab-case`，例如 `run-store.ts`、`tech-lead-agent.ts`。
- 一个文件以一个主要概念为中心，不按“工具函数”堆放无关逻辑。
- 单元测试文件必须放在被测文件同级的 `__tests__/` 目录中，不得直接与待测试源码平级。
- `__tests__/` 中的测试文件与被测源码同名，命名 `*.test.ts`。
- 跨包集成测试统一放在根目录 `tests/integration/`。
- 类型、Schema 和实现可以分文件，但不要为了单行定义制造大量碎片文件。

推荐的模块目录结构：

```text
run-store/
├── index.ts
├── run-store.ts
├── types.ts
├── constant.ts
└── __tests__/
    └── run-store.test.ts
```

### 3.2 类型声明

- 任意代码文件中，只要存在需要被导出的 `type` 或 `interface`，都必须移动到该模块的 `types.ts` 中声明，不得直接留在实现文件内。
- `types.ts` 的职责是声明模块公共类型，不承载运行时代码或具体业务流程。
- 非导出的局部类型可以留在实现文件内，但一旦被其他文件引用，即视为公共类型并应迁入 `types.ts`。
- 函数参数是简单的基本类型，或只是局部使用且没有复用价值的简单函数签名，可以直接声明，不必为此创建类型。
- 对象参数、对象返回值、跨模块函数签名、Agent 输入输出和工具参数必须使用 `types.ts` 中的类型或 Zod 推导类型。
- 公共类型统一通过模块 `index.ts` 导出，外部代码不得直接引用 `types.ts`。

示例：

```typescript
// types.ts
export interface RunOptions {
  readonly prompt: string;
  readonly timeoutMs: number;
}

// run-store.ts
import type { RunOptions } from './types.js';

export function createRun(prompt: string, timeoutMs: number): string {
  // 基本类型入参可以直接声明。
  return `${prompt}:${timeoutMs}`;
}

export function createRunWithOptions(options: RunOptions): string {
  return `${options.prompt}:${options.timeoutMs}`;
}

// index.ts
export type { RunOptions } from './types.js';
export { createRun, createRunWithOptions } from './run-store.js';
```

### 3.3 公共常量

- 任何可能被多个位置重用的字面量，都必须在公共 `constant.ts` 文件中声明，不得在业务代码中重复硬编码。
- 常量优先放在最近使用模块的 `constant.ts` 中；同一包内多个模块共享时，提升到包级公共 `constant.ts`。
- 常量通过 `as const` 保留字面量类型，命名使用 `UPPER_SNAKE_CASE`。
- 只使用一次且没有语义价值的局部字面量可以留在原位置，但阶段名、错误码、环境变量键、状态值、目录名和默认限制值不得散落。
- 公共常量统一通过模块 `index.ts` 导出，外部代码不得直接引用 `constant.ts`。

示例：

```typescript
// constant.ts
export const RUN_STATUS = {
  SPEC: 'spec',
  PLAN: 'plan',
  BUILD: 'build',
  VERIFY: 'verify',
  REVIEW: 'review',
} as const;

export const DEFAULT_TIMEOUT_MS = 30_000;
```

### 3.4 导出与模块边界

- 核心包统一使用具名导出，禁止 default export。
- 每个模块必须以 `index.ts` 作为唯一公共导出入口，`index.ts` 只负责重新导出，不承载实现逻辑。
- 模块外部的代码只能引用该模块的 `index.ts`，不得直接引用模块内的实现源码。
- 禁止外部代码直接引用 `run-store.ts`、`types.ts`、`constant.ts` 或其他内部文件。
- 模块内部的实现文件可以按依赖关系引用具体源码，以避免不必要的 Barrel File 循环；跨越模块公共边界时必须经过 `index.ts`。
- 包的 `package.json` 只暴露公共入口和经过明确设计的子路径，禁止通过 `exports` 放开整个 `src` 目录。
- 禁止跨包深层导入，例如禁止从 `@bossflow/core/src/internal/...` 导入；只能使用包或模块的公共入口。
- CLI 可执行文件只负责启动，实际逻辑通过具名 `main()` 函数调用，便于测试。

依赖方向保持单向：

```text
adapters ──→ core
cli      ──→ core
core     ──→ 不反向依赖 cli 或 adapters
```

### 3.5 模块副作用

- 不在模块顶层读取环境变量、写文件、发送网络请求或启动进程。
- `dotenv/config` 仅允许出现在 CLI 或 Adapter 的进程入口。
- 不创建隐式全局单例。配置、Logger、时钟、ID 生成器和外部服务通过参数注入。
- 模块在 import 时不应产生用户不可见的持久副作用。

## 4. 命名规范

| 对象                   | 规范             | 示例                              |
| ---------------------- | ---------------- | --------------------------------- |
| 类型、接口、类、Schema | PascalCase       | `WorkflowEngine`、`PlanSchema`    |
| 函数、变量、参数、属性 | camelCase        | `createRun`、`runId`、`createdAt` |
| 文件名                 | kebab-case       | `run-store.ts`                    |
| 固定常量               | UPPER_SNAKE_CASE | `DEFAULT_TIMEOUT_MS`              |
| 环境变量键             | UPPER_SNAKE_CASE | `OPENAI_API_KEY`                  |
| 测试文件               | 与源文件同名     | `run-store.test.ts`               |

- 布尔值使用 `is`、`has`、`can`、`should` 前缀，例如 `isReady`、`hasChanges`。
- 时间值带单位，例如 `timeoutMs`、`createdAt`、`elapsedSeconds`。
- 异步函数不使用 `Async` 后缀，返回类型已经能表达异步语义。
- 接口不加 `I` 前缀，类型不加 `Type` 后缀。
- 缩写保持普通单词大小写，例如 `runId`、`apiUrl`、`httpStatus`。
- 函数名使用动词短语，例如 `loadConfig`、`validatePlan`、`createWorktree`。
- 避免 `data`、`info`、`manager`、`helper` 等无法说明职责的名称。

## 5. 函数与可读性

- 函数优先做一件事，并通过早返回减少嵌套。
- 嵌套层级建议不超过 3 层，ESLint 硬限制设为 4 层。
- 圈复杂度建议不超过 10，ESLint 初始限制设为 12。
- 函数长度建议不超过 80 行，ESLint 初始警告阈值设为 120 行。
- 文件长度建议不超过 300 行，ESLint 初始警告阈值设为 400 行。
- 超过 3 个参数时使用命名 Options 对象，避免调用方依赖参数位置。
- 不使用布尔参数控制两个差异明显的流程；拆成语义明确的函数。
- 禁止嵌套三元表达式。
- 简单表达式内联，复杂条件提取为有业务含义的变量或函数。
- 不用抽象层包装 Node.js、Zod 或 SDK 已经清晰的一行调用。

## 6. 异步、并发与取消

- 所有 Promise 必须被 `await`、返回，或显式通过 `void` 标记为有意不等待。
- 禁止在 `Array.prototype.forEach` 中执行异步函数。
- 并行且相互独立的任务使用 `Promise.all` 或 `Promise.allSettled`。
- 调用模型、Shell、Git 和 MCP 时必须传递超时或 `AbortSignal`。
- 不吞掉 `AbortError`。取消和失败应在阶段结果中明确区分。
- 资源清理放在 `try/finally` 中，包括临时 Worktree、临时文件和锁。
- 不自行实现无上限并发；实现 Agent 或工具并发前先定义并发上限。
- 异步回调边界通过 `void operation()` 显式标记时，必须在操作内部处理错误并记录。

## 7. 错误处理

- `catch` 中的错误视为 `unknown`，不得直接访问 `error.message`。
- 区分预期业务分支与基础设施异常：
  - 范围缺失、审批拒绝、验证失败等预期分支建模为判别联合。
  - IO、网络、配置损坏等异常通过 `throw` 失败，并由阶段边界统一处理。
- 自定义错误包含稳定错误码，不使用自由文本作为程序分支条件。
- 重新抛出错误时使用 `cause` 保留原始错误。
- 禁止空 `catch`、静默回退和只打印日志后继续执行。
- 面向用户的错误信息不暴露密钥、完整环境变量、内部堆栈或不受信任的路径。

错误示例：

```typescript
try {
  await runVerification(signal);
} catch (error: unknown) {
  throw new WorkflowStageError('VERIFICATION_FAILED', 'Verification failed', {
    cause: error,
  });
}
```

## 8. Zod 与边界校验

- 所有外部数据在边界处解析：配置文件、环境变量、模型结构化输出、工具参数、读取的 JSON 和外部 API 响应。
- 同一数据只保留一个 Zod Schema 作为事实来源。
- Schema 命名以 `Schema` 结尾，推导类型不重复 Schema 后缀。
- 启动配置和内部不变量使用 `parse` 快速失败。
- 需要向用户展示字段级错误时使用 `safeParse`，并把 `ZodError` 转为领域错误。
- 配置文件默认拒绝未知字段，避免拼写错误被静默忽略。
- 具有跨版本兼容需求的外部协议，可以显式选择保留或忽略未知字段，但必须在 Schema 附近注明原因。
- 持久化产物包含 `schemaVersion`，迁移逻辑与当前 Schema 分离。

```typescript
const PlanSchema = z
  .object({
    schemaVersion: z.literal(1),
    tasks: z.array(TaskSchema),
  })
  .strict();

type Plan = z.infer<typeof PlanSchema>;
```

## 9. Agents、工具与安全边界

- `@openai/agents` 只允许在 `core/agents` 中直接导入。
- 编排器使用 `agent.asTool()` 汇总专家结果；只有明确需要转移会话所有权时才使用 handoff。
- Agent 输出如果参与后续流程，必须绑定 Zod Schema，不解析自然语言猜测字段。
- 每个工具声明明确输入 Schema、超时、权限范围、错误码和输出上限。
- Shell 命令优先通过 `execa` 参数数组执行，默认禁止 `shell: true`。
- 禁止将模型输出直接拼接为 Shell 命令、文件路径或 Git ref。
- 文件写入前规范化路径并校验目标位于当前项目或隔离 Worktree 内。
- 测试、Lint、构建和 Git 操作保留真实退出码，不以日志文本推断成功。
- 日志使用 `pino`，禁止在 Core 中直接使用 `console`。CLI 的用户界面输出除外，并限制在专用输出模块。

## 10. 注释与文档

- 注释解释“为什么”和“必须保持的约束”，不复述代码“做了什么”。
- 导出的跨包 API、复杂状态迁移和安全边界应提供简短文档注释。
- 不保留注释掉的旧代码，历史交给 Git。
- TODO 必须包含原因和明确条件：

```typescript
// TODO(bossflow): 移除兼容层，待最低支持版本升级到 Node.js 24。
```

- ESLint 禁用必须窄到单行或明确区块，并注明原因。禁止无说明地关闭整个文件规则。
- JSDoc 不重复 TypeScript 已表达的参数和返回类型，重点描述副作用、不变量和失败条件。

## 11. Prettier 初始配置

Prettier 是格式问题的唯一决策者：

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

- 不在代码评审中手工讨论 Prettier 已覆盖的换行和空格。
- 格式化 Markdown、JSON、YAML 和 TypeScript。
- CI 执行 `prettier --check`。
- 不使用 `eslint-plugin-prettier`。
- `eslint-config-prettier` 必须位于 ESLint 配置末尾，关闭格式冲突规则。

## 12. ESLint 初始规则方向

除 `@eslint/js` 推荐规则和 `typescript-eslint` 推荐规则外，至少启用：

- `@typescript-eslint/no-explicit-any`: `error`
- `@typescript-eslint/no-floating-promises`: `error`
- `@typescript-eslint/no-misused-promises`: `error`
- `@typescript-eslint/await-thenable`: `error`
- `@typescript-eslint/consistent-type-imports`: `error`
- `@typescript-eslint/switch-exhaustiveness-check`: `error`
- `@typescript-eslint/no-unused-vars`: `error`，允许 `_` 前缀的明确忽略参数
- `eqeqeq`: `error`
- `prefer-const`: `error`
- `no-console`: `error`，仅 CLI 输出模块允许
- `no-var`: `error`
- `curly`: `error`
- `complexity`: `warn`，初始阈值 12
- `max-depth`: `warn`，初始阈值 4
- `max-lines-per-function`: `warn`，初始阈值 120
- `max-lines`: `warn`，初始阈值 400

规则以“能帮助发现真实问题”为准。首次接入后运行完整仓库，逐条评估误报，不一次性复制几十个互相重叠的规则集。

## 13. Jest 测试约定

- 单元测试必须放在被测源码同级的 `__tests__/` 目录下，禁止把测试文件直接放在源码旁边。
- 测试文件与被测源码同名，命名为 `*.test.ts`，例如 `run-store.ts` 对应 `__tests__/run-store.test.ts`。
- 测试优先通过模块 `index.ts` 验证公共行为，不直接依赖模块内部实现文件；只有验证明确的内部不变量时才允许引用内部文件，并在测试中说明原因。
- 测试描述关注行为和约束，而不是内部实现，例如 `rejects a plan with missing acceptance criteria`。
- 使用 Arrange → Act → Assert 结构，一个测试只验证一个主要行为。
- 核心 Workflow、Schema 和 Tool Adapter 不进行真实网络请求。
- 通过注入 Fake Model、Fake Clock、Fake ID Generator 和 Fake Tool 控制不确定性。
- Shell、Git 和文件系统集成测试使用 `fs.mkdtemp()` 创建临时目录，测试结束后在 `finally` 中清理。
- 不对 Agent 的自然语言输出使用快照测试；对有稳定 Schema 的结构化输出使用精确断言。
- 不通过修改模块全局状态实现 Mock；优先替换明确的接口依赖。
- 覆盖率重点放在 Workflow、Schema、权限和恢复逻辑，不用整体覆盖率数字掩盖关键路径缺口。
- Jest 使用 ESM 配置，不为了测试把生产代码降级为 CommonJS。

## 14. CI 与提交前检查

统一提供以下命令：

```text
pnpm format
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

CI 至少依次执行：

```text
format:check → lint → typecheck → test → build
```

建议使用 Git Hook 只执行快速检查，例如 `format:check` 和 `lint`；完整类型检查、测试与构建保留在 CI，避免每次提交等待过久。

## 15. 初始落地顺序

1. 建立根目录 TypeScript、Prettier、ESLint 和 Jest 配置。
2. 用一个小型 `core` 模块和对应测试验证 Jest ESM、类型导入和覆盖率。
3. 接入 `@openai/agents` 的最小 Agent 测试，确认第三方 ESM 包可被 Jest 正确加载。
4. 加入目录依赖边界检查，禁止 Core 反向依赖 CLI 或 Adapter。
5. 用第一批真实代码调整阈值，避免规则长期以 `eslint-disable` 方式存在。
