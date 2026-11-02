# 项目上下文与验证命令

## 检测内容

BossFlow 在创建运行前识别以下信息：

- Git 根目录、当前分支、工作区是否干净以及变更路径。
- `pnpm`、`npm`、`yarn` 或 `bun` 包管理器。
- TypeScript、JavaScript、Python、Rust、Go、Java、Kotlin、Ruby 和 PHP 源文件。
- React、Next.js、Vue、Svelte、Angular、Express、Fastify、NestJS、Vite、Jest 和 Vitest。
- `AGENTS.md`、README、CONTRIBUTING、OpenSpec 和测试配置。
- `package.json` 中的验证脚本。

单个规划上下文文件最多读取 64 KiB，每次最多读取 50 个上下文文件。检测结果只保存文件路径和精简元数据，不把 README、AGENTS 或测试配置全文写入 `run.json`。

## 验证命令

默认要求项目提供以下命令：

1. `lint`
2. `typecheck`
3. `test`
4. `build`

脚本别名映射如下：

| 类型      | 接受的脚本名                             |
| --------- | ---------------------------------------- |
| lint      | `lint`、`lint:check`                     |
| typecheck | `typecheck`、`type-check`、`check:types` |
| test      | `test`、`test:unit`                      |
| build     | `build`、`compile`                       |

检测到脚本后，BossFlow 生成结构化命令，例如：

```json
{
  "id": "test",
  "label": "Test",
  "command": "pnpm",
  "args": ["run", "test"],
  "required": true,
  "timeoutMs": 120000
}
```

## 配置覆盖

项目可以在 `.bossflow/config.yaml` 中调整必需命令、默认超时和单项命令覆盖：

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
      lint:
        command: node
        args:
          - scripts/lint.mjs
        timeoutMs: 30000
```

显式覆盖优先于 `package.json` 脚本检测，不执行字符串拼接或 `shell: true`。

当前版本只会从 JavaScript/TypeScript 项目的 `package.json` 自动解析验证命令。其他语言项目应使用 `commandOverrides` 显式配置；语言特定的自动命令策略属于后续扩展。

## 歧义确认

以下情况会阻止运行：

- 存在多个包管理器锁文件。
- 存在 `package.json`，但没有可识别的锁文件。
- 缺少必需验证命令。
- 项目不是 Git 仓库。
- `package.json` 无法解析或校验。

用户查看原因后，可以使用 `bossflow run ... --confirm-project` 显式接受检测结果。运行记录中的 `projectProfile.confirmedByUser` 会保存该决定，后续恢复运行直接复用同一项目档案和命令。
