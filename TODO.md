# BossFlow TODO

## npm Registry

- [ ] Decide whether to publish as `@61joe/bossflow-core` and `@61joe/bossflow-cli`, or use the `@bossflow` npm scope.
- [ ] Select the package license.
- [ ] Authenticate to the npm registry.
- [ ] Change publishable packages from `private: true` after package names and licensing are confirmed.
- [ ] Add npm publish steps to the release workflow.
- [ ] Verify npm publication only after the GitHub Release flow is stable.

## Project Context Extensions

- [ ] Add language-specific default verification commands for Rust, Go, Python, Java, Ruby and PHP projects.
- [ ] Make source scanning honor repository ignore rules and large-monorepo path filters.

## Codex Adapter Installer

- [ ] Add a cross-process file lock for concurrent Codex Skill installs and verify deterministic conflict or idempotent behavior under parallel execution.
