# Proposal

## Why

BossFlow documents `packages/adapters` as the Coding Agent boundary, but the actual Codex process
integration currently lives in the CLI package. As a result, adding another Coding Agent would
still require changing CLI workflow code, and `execa` is owned by the wrong package.

## What Changes

- Extend the Coding Agent adapter contract so an adapter can provide the Worktree Implementer used
  by the Build stage.
- Move Codex prompt construction, `codex exec` invocation, failure normalization, timeout, output
  limits, and adapter tests from `packages/cli` into `packages/adapters/src/codex`.
- Change the CLI Coding Agent registry to register adapter objects rather than concrete implementer
  factories, then resolve the Build implementer through the adapter contract.
- Move the `execa` runtime dependency from `@bossflow/cli` to `@bossflow/adapters`.
- Keep Skill installation behind an adapter capability so CLI commands do not import a concrete
  Codex installer.
- **BREAKING** Move the exported `createCodexWorktreeImplementer` API from `@bossflow/cli` to
  `@bossflow/adapters`.
- Preserve the existing workflow stages, approvals, Worktree behavior, command execution,
  verification, Review, persistence, and user-facing CLI commands.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `coding-agent-adapters`: define that a supported adapter owns both its descriptor and the
  Worktree Implementer used by Build, while CLI composition selects adapters through that stable
  contract.

## Impact

- Core adapter contracts and public exports.
- `@bossflow/adapters` Codex implementation, dependencies, and tests.
- CLI adapter registry, command composition, package dependencies, and removed Codex-specific code.
- Package lockfile, Changesets, architecture documentation, and OpenSpec specifications.
- No database, queue, model-profile, workflow-state, or approval behavior changes.
