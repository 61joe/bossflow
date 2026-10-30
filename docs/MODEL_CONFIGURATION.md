# BossFlow 模型配置与凭据管理

| 项目     | 内容                                      |
| -------- | ----------------------------------------- |
| 文档版本 | v0.1                                      |
| 更新日期 | 2026-10-30                                |
| 适用范围 | CLI 独立运行时与后续 Coding Agent Adapter |

## 1. 设计目标

- 模型、Provider、Endpoint 和 API Key 可以独立配置。
- 在项目配置中明确记录使用哪个模型档案。
- API Key 不进入 Git、模型配置文件、日志、聊天输出或 CLI 参数。
- 支持 OpenAI Responses API 与 OpenAI-compatible Chat Completions 接口。
- 为后续 Vercel AI SDK Adapter 和自定义 `ModelProvider` 保留扩展边界。

## 2. 模型档案

项目配置位于 `.bossflow/config.yaml`，不允许保存 API Key：

```yaml
schemaVersion: 1
workflow:
  initialStage: spec
  runDirectory: .bossflow/runs
models:
  defaultProfile: openai
  profiles:
    openai:
      kind: openai
      apiKeyEnv: OPENAI_API_KEY
    local:
      kind: openai-compatible
      model: coding-model
      baseUrl: http://localhost:11434/v1
      apiKeyEnv: LOCAL_MODEL_API_KEY
```

当前支持：

- `openai`：OpenAI Responses API，可选指定 `model`、`baseUrl` 和 `useResponses`。
- `openai-compatible`：使用 Chat Completions API 的兼容服务，强制要求 `model` 和 `baseUrl`。

`openai-compatible` 使用 `strictFeatureValidation`，不会静默忽略 Responses API 专属能力。

### DeepSeek 兼容策略

DeepSeek 的当前 Chat Completions API 不接受 Agents SDK 默认发送的 `response_format.type = "json_schema"`。因此 `openai-compatible` 档案采用以下兼容策略：

1. 不向 Provider 发送原生 JSON Schema 结构化输出请求。
2. 在 Agent instructions 中要求模型只返回符合字段契约的 JSON。
3. 使用 Zod 在本地解析和校验；兼容 Markdown JSON 代码块。
4. 默认关闭 OpenAI Trace Exporter，避免非 OpenAI Provider 要求额外的 `OPENAI_API_KEY`。

2026-10-30 已使用 `deepseek-flash`、`https://api.deepseek.com` 完成最小探针和完整规格生成验证。

## 3. CLI 配置

### 添加或替换模型档案

```text
bossflow model add local \
  --kind openai-compatible \
  --model coding-model \
  --base-url http://localhost:11434/v1 \
  --api-key-env LOCAL_MODEL_API_KEY \
  --default
```

### 查看和切换模型

```text
bossflow model list
bossflow model use local
bossflow model remove local
bossflow model test local
```

默认模型以 `*` 标记。不能删除当前默认档案，也不能删除最后一个档案。

`model test` 会发起一次最小真实调用，验证鉴权、Endpoint、模型名称和结构化输出链路；它会消耗少量模型额度。

### 为单次运行选择模型

```text
bossflow run "增加导出功能" --profile local
bossflow run "增加导出功能" --profile local --model another-model
```

Run 的 `run.json` 会记录模型档案和模型标识，便于审计和复盘。

## 4. API Key 配置

### 交互式写入本地凭据

```text
bossflow auth set local
```

命令使用隐藏输入，不需要把 API Key 作为 CLI 参数传入。

### 通过标准输入写入

```text
bossflow auth set local --stdin < /secure/path/api-key.txt
```

`--stdin` 只接受重定向或管道输入；在交互式终端中直接使用时会拒绝执行，避免密钥被终端回显。交互式场景请省略 `--stdin`，使用隐藏输入。

### 查看凭据来源

```text
bossflow auth status
```

命令只显示 `environment`、`local-file` 或 `missing`，不会显示密钥内容。

### 删除本地凭据

```text
bossflow auth clear local
```

## 5. 凭据解析顺序

1. 模型档案 `apiKeyEnv` 指向的环境变量。
2. `.bossflow/credentials.local.yaml` 中对应模型档案的密钥。
3. 报告为缺失并拒绝调用模型。

`openai` 档案默认读取 `OPENAI_API_KEY`。OpenAI-compatible 档案默认读取 `BOSSFLOW_MODEL_API_KEY`，也可以显式配置独立的 `apiKeyEnv`。

这种隔离可以降低把 OpenAI Key 误发给自定义 Endpoint 的风险。

## 6. 本地凭据文件

路径：

```text
.bossflow/credentials.local.yaml
```

安全约束：

- 必须在 `.gitignore` 中忽略。
- 写入权限固定为 `0600`。
- 读取时拒绝符号链接。
- 读取时拒绝组用户或其他用户可读的权限。
- 不把内容复制到日志、错误信息或运行产物。

该文件仍是明文 YAML，只适合个人开发环境作为便利存储，不等同于系统级密钥保险箱。

## 7. Endpoint 安全约束

- 远程 Endpoint 必须使用 HTTPS。
- HTTP 只允许 `localhost`、`127.0.0.1` 和 `::1`。
- 每个模型档案绑定自己的 `apiKeyEnv` 或本地凭据条目。
- 模型响应仍必须通过 Zod Schema 校验。

## 8. 不同配置方式评估

| 方式                                     | 支持 | 安全与合规判断                                                |
| ---------------------------------------- | ---- | ------------------------------------------------------------- |
| `.bossflow/config.yaml` 保存明文 API Key | 否   | 该文件通常进入版本控制或被分享，不应保存密钥                  |
| `--api-key` 命令行参数                   | 否   | 会进入 Shell 历史和进程参数，容易泄露                         |
| `.env` 环境变量                          | 是   | 常见开发方式；必须忽略 `.env`，适合用户自有开发机             |
| CLI 隐藏输入写入本地凭据文件             | 是   | `0600` 且忽略后可用于个人开发；仍是明文，不等同企业级密钥管理 |
| 操作系统 Keychain / Credential Manager   | 后续 | 最推荐的本机个人凭据方案，需要跨平台实现                      |
| CI/CD Secrets 或云端密钥管理             | 后续 | 适合自动化和团队环境，不应由项目配置文件承载                  |

“可支持”不等于对所有地区、组织或数据场景自动合规。API Key 的使用仍需遵守模型服务商条款、组织安全政策、数据驻留要求和访问控制要求。BossFlow 当前不判断这些外部政策，只负责避免明显不安全的本地存储方式。

## 9. 当前限制

- 尚未接入 Vercel AI SDK Adapter。
- 尚未接入操作系统 Keychain。
- `model test` 当前覆盖最小结构化输出，尚未覆盖工具调用、长上下文和取消行为。
- 团队共享和 CI 自动化尚未实现，不应把个人凭据文件分发到其他机器。

## 10. 后续演进

1. 增加 `bossflow model test <profile>`，验证结构化输出、工具调用和错误恢复。
2. 增加 `@openai/agents-extensions/ai-sdk` 适配，支持更多原生模型 Provider。
3. 增加 macOS Keychain、Windows Credential Manager 和 Linux Secret Service。
4. 增加 Provider 能力声明，阻止模型在不支持结构化输出时进入开发流程。
