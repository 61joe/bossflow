# BossFlow 故障排查

## 启动失败

先确认当前 shell 使用 Node.js 24 或更新版本：

```text
node --version
```

CLI 会在加载业务模块前检查运行时。版本不满足时直接显示检测版本和最低要求，而不是暴露依赖包
内部错误。

## Build 前检查

```text
bossflow doctor --run
```

常见失败与处理：

- `Configuration`：运行 `bossflow init`，已有配置时检查 `.bossflow/config.yaml`。
- `Model credential`：设置配置引用的环境变量，或运行 `bossflow auth set <profile>`。
- `Git worktree`：提交或 stash 本地修改；项目不是 Git 仓库时先初始化 Git。
- `Package metadata`：提供唯一受支持的锁文件，或配置 verification command overrides。
- `Worktree root`：为仓库父目录授予写权限，或在支持后配置可写的 managed root。

`doctor --run` 只检查本地状态，不调用模型 Endpoint。需要检查鉴权、模型名和结构化输出时，运行：

```text
bossflow model test <profile>
```

## Blocked 与 Failed Run

先运行 `bossflow status <run-id>`，读取真实 failure evidence 和下一步命令。需要修改代码时从
Build 重试；只需重新验证时从 Verify 重试：

```text
bossflow retry <run-id> --from build
bossflow retry <run-id> --from verify
```

`resume` 不会静默重新打开 terminal Run。Verify retry 发现 Worktree Diff 与最近接受的
implementation evidence 不一致时，会要求改用 Build retry。
