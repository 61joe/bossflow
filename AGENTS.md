# BossFlow Agent Instructions

## 必读文档

在修改代码前阅读：

- `docs/PRD.md`
- `docs/TECH_STACK.md`
- `docs/TS_STYLE_GUIDE.md`

若文档冲突，先解决冲突再实现。

行为变更还必须检查 `openspec/specs/`，并通过 OpenSpec change 描述 proposal、spec delta 和任务。实现完成后运行 `pnpm spec:validate`。

## 工程命令

提交前运行：

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm spec:validate
```

快速全量检查使用 `pnpm check`。

## 必须遵守

- TypeScript 使用 ESM 和 NodeNext，相对导入带 `.js` 扩展名。
- 测试放在同级 `__tests__/`，不得与源码平级。
- 导出的 `type` 和 `interface` 放在模块 `types.ts`，经 `index.ts` 导出。
- 可复用的业务字面量放在模块 `constant.ts`。
- 跨模块引用只能经过公共 `index.ts`；模块内部实现可以按依赖关系直接引用。
- 不直接引用其他包的 `src`、`types.ts` 或 `constant.ts`。
- 外部输入必须通过 Zod 校验。
- 不在模块导入阶段读取环境变量或产生持久副作用。
- API Key 不得写入 `.bossflow/config.yaml`、CLI 参数、日志或运行产物。
- 本地凭据只能通过 `bossflow auth` 管理，并保持 `0600` 和 Git 忽略。
- 不得绕过 Husky 或使用 `--no-verify`，除非用户明确要求。
- 不得直接提交或推送 `main`、`master`；从功能分支创建 PR，等待 CI 通过后再合并。
- 未经明确授权不执行提交、推送、合并或创建 PR。

## 完成标准

- 行为变更伴有测试。
- 类型检查、Lint、格式、Jest 和构建通过。
- 运行产物与文档协议保持兼容。
- 最终汇报列出实际修改、验证命令和未完成事项。
