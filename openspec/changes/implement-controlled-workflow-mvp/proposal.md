## Why

The current implementation can generate a validated specification, but it cannot yet complete the controlled development loop described by the PRD. Users still need an executable plan, isolated implementation, real verification evidence, independent review, recovery, and explicit approval gates before code changes or external Git operations.

## What Changes

- Extend the workflow from specification-only execution to Plan, Build, Verify, Review, and Summary.
- Add structured deliverables for plans, decisions, verification evidence, review findings, and final summaries.
- Introduce Product, Tech Lead, Implementer, and Reviewer role boundaries with per-stage tools and permissions.
- Require explicit approval of scope and plan before implementation, and explicit approval before commit, push, merge, or PR creation.
- Run implementation in an isolated Git worktree and record commit, diff, command, and evidence metadata.
- Add CLI operations to inspect status, approve gates, and resume an interrupted run.
- **BREAKING** `bossflow run` will stop at the plan-approval gate by default instead of silently attempting implementation; `--stop-after spec` preserves specification-only behavior.
- Make the Codex `$bossflow` entrypoint installable in target repositories and align its instructions with persisted workflow state.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workflow-runs`: extend run artifacts, stage transitions, gated execution, worktree isolation, verification, review, recovery, and summary behavior.
- `cli-interface`: add plan-gate and review-gate operations, status inspection, approval recording, and resumable execution.
- `coding-agent-adapters`: make the Codex workflow entrypoint installable and require it to honor persisted approvals and actual stage completion.

## Impact

- Code: `packages/core` workflow, models, run store, Agents SDK roles, worktree and command adapters.
- CLI: new commands and options, structured output, exit codes, and resume behavior.
- Adapter: Codex Skill installation and stage-aware operating instructions.
- Data: additive run metadata and new Markdown/JSON artifacts under `.bossflow/runs/<run-id>/`.
- Dependencies: existing `simple-git` and `execa` become active runtime dependencies; no new service or database is required.
- Tests: role contracts, gate transitions, worktree lifecycle, command evidence, failure recovery, and CLI integration.
