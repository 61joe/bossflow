# BossFlow 发布流程

BossFlow 使用 Changesets 管理版本，通过独立 Release PR 合并版本变更，并在 Release PR 合并后创建
GitHub Release。

当前只启用 GitHub Release；npm Registry 发布尚未启用。

## 基本原则

- 普通功能 PR 合并到 `main` 只积累待发布 Changesets，不会自动创建 Release PR。
- Release PR 由人工从 `main` 手动触发 `Release PR` workflow 创建或更新。
- Release PR 合并后，`GitHub Release` workflow 创建 `vX.Y.Z` Tag 和 GitHub Release。
- 当前不执行 `npm publish`。
- 不得从普通功能 PR 直接创建 Release。

## 添加 Changeset

需要发布的用户可见变更必须包含 `.changeset/*.md`。在仓库根目录运行：

```bash
pnpm changeset
```

根据提示选择包和语义化版本级别，并填写面向用户的版本说明。Changeset 应与功能或修复一起提交到
普通功能 PR。

## 创建 Release PR

确认 Changesets 已合并到 `main` 后，手动运行：

```bash
gh workflow run release-pr.yml --repo 61joe/bossflow --ref main
```

查看运行状态：

```bash
gh run list --repo 61joe/bossflow --workflow release-pr.yml --limit 1
```

workflow 会执行以下操作：

1. 从最新 `main` 创建或更新 `chore/release` 分支。
2. 运行 `pnpm changeset version` 和 `pnpm install --lockfile-only`。
3. 提交版本变更并更新 `chore/release`。
4. 如果不存在开放 Release PR，则创建 PR；如果已存在，则更新标题和说明。

`Release PR` 仅支持手动触发，普通 PR 合并不会启动该 workflow。

## 合并 Release PR

Release PR 必须像普通 PR 一样通过 `Branch name policy`，相关质量 CI 也会运行。

合并前检查：

- 版本号和 Changelog 符合预期。
- 没有包含与发布无关的代码改动。
- CI 和 `pnpm check` 通过。
- `pnpm spec:validate` 通过。

Release PR 不得由自动化流程自行合并。

## 创建 GitHub Release

Release PR 合并到 `main` 后，`GitHub Release` workflow 会：

1. Checkout Release PR 的 merge commit。
2. 执行 `pnpm check && pnpm spec:validate`。
3. 从 `packages/cli/package.json` 读取版本号。
4. 检查对应 Tag 是否已经存在。
5. 创建 `v<version>` Tag 和 GitHub Release，并使用 GitHub 自动生成 Release Notes。

查看已有 Release：

```bash
gh release list --repo 61joe/bossflow
```

如果 Tag 已存在，workflow 会失败，不会覆盖既有 Release。

## RELEASE_PR_TOKEN

Release PR workflow 需要仓库 secret `RELEASE_PR_TOKEN`。使用仅授权当前仓库的 GitHub fine-grained
personal access token，并授予：

- Contents: Read and write
- Pull requests: Read and write

配置命令：

```bash
gh secret set RELEASE_PR_TOKEN --repo 61joe/bossflow
```

不要把 token 发送到聊天、提交到仓库或写入日志。

使用专用 token 的原因是：仓库内置 `GITHUB_TOKEN` 创建的 Pull Request 事件不会再次触发普通
Pull Request workflow，因此自动创建的 Release PR 不会正常触发 `Branch name policy` 和 CI。

## npm Registry

npm 发布尚未启用。启用前仍需确定：

- npm scope 和包名。
- 许可证。
- Registry 认证方式。
- 可发布包的 `private` 状态。
- Release workflow 中的 npm publish 步骤。

在 GitHub Release 流程稳定且上述事项完成前，不应执行 npm 发布。相关待办记录在
[TODO.md](../TODO.md)。

## 发布失败排查

| 问题                              | 排查方向                                                           |
| --------------------------------- | ------------------------------------------------------------------ |
| `Missing RELEASE_PR_TOKEN`        | 检查仓库 Secret 是否存在，以及 workflow 是否能读取。               |
| Release PR 未触发 PR Policy 或 CI | 确认 workflow 使用 `RELEASE_PR_TOKEN`，而不是内置 `GITHUB_TOKEN`。 |
| 没有生成版本变更                  | 检查 `main` 上是否存在未消费的 `.changeset/*.md`。                 |
| GitHub Release 创建失败           | 检查对应 Tag 是否已存在、版本号是否正确以及 release job 权限。     |
| Release PR 包含无关改动           | 检查 `chore/release` 是否从最新 `main` 重新创建。                  |
