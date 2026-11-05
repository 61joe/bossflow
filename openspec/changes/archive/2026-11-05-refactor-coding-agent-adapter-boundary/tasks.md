# Tasks

## 1. Core Adapter Contract

- [x] 1.1 Extend the public Coding Agent adapter contract so it can create the Worktree Implementer used by Build, using a type-only dependency on the existing implementation contract; verify production typecheck and all Core tests pass.
- [x] 1.2 Add a separate optional Skill-installation capability contract and export it through the Core module public index; verify a TypeScript compile fixture or unit test can reference the capability without requiring it on every adapter.

## 2. Move Codex Execution Into Adapters

- [x] 2.1 Move Codex prompt construction, `codex exec` invocation, timeout, output limit, cancellation, failure normalization, and redaction into `packages/adapters/src/codex`; verify migrated tests cover successful, non-zero, thrown, missing-exit-code, empty-output, cancellation, and redaction paths.
- [x] 2.2 Make `CodexAdapter` provide both descriptor and implementer capabilities, while preserving its Skill installation behavior; verify adapter tests assert the descriptor, implementer factory, and installer delegation.
- [x] 2.3 Move `execa` ownership from `@bossflow/cli` to `@bossflow/adapters`, update `pnpm-lock.yaml`, and verify `pnpm install --lockfile-only` and package builds succeed.
- [x] 2.4 Export the Codex implementer and public adapter capability types only through `@bossflow/adapters`; verify no external consumer must import the internal `codex-implementer.ts` file directly.

## 3. Refactor CLI Composition

- [x] 3.1 Change `CodingAgentRegistry` to register adapter objects and resolve descriptor, implementer, and optional installation capabilities; verify unit tests cover normalized IDs, duplicate adapters, unknown adapters, and a custom adapter.
- [x] 3.2 Register the default Codex adapter in CLI composition and resolve its implementer before constructing `WorkflowService`; verify the existing workflow service tests still receive the same `WorktreeImplementer` behavior.
- [x] 3.3 Route `bossflow adapter install codex` through the selected adapter capability instead of importing the concrete installer in CLI command handling; verify install, idempotent install, conflict, overwrite, and unsupported-adapter tests.
- [x] 3.4 Remove CLI Codex implementer files, tests, workflow exports, and the direct `execa` dependency; verify repository-wide search finds no CLI-owned `codex exec` implementation and all CLI tests pass.

## 4. Integration, Compatibility, And Documentation

- [x] 4.1 Update architecture and dependency documentation so `execa`, Codex process execution, prompt construction, and process-limit behavior are documented under `@bossflow/adapters`; verify documentation paths and package names match the implementation.
- [x] 4.2 Add Changesets for `@bossflow/adapters` and `@bossflow/cli`, explicitly recording the moved implementer export and dependency ownership change; verify the Changesets files pass formatting and do not include npm publication steps.
- [x] 4.3 Run the full test suite and verify statements, branches, functions, and lines coverage remain at 100% after moving source and tests between packages.
- [x] 4.4 Run `pnpm check` and `pnpm spec:validate`; verify formatting, lint, typecheck, tests, build, workspace dependency boundaries, and all OpenSpec items pass.
- [x] 4.5 Run at least one `pnpm conformance:codex -- --scenario <id>` scenario through the normal CLI path; verify Build uses the real Codex adapter, the workflow reaches the expected outcome, and the generated report contains no credentials.

## Workflow follow-up

- Archive this change after review, implementation, conformance evidence, and human acceptance are complete.
- Do not add a second Coding Agent or dynamic coding-agent configuration in this change.
