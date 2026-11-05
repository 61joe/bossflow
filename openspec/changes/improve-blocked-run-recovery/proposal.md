# Proposal

## Why

BossFlow can stop safely, but a blocked run may not expose enough evidence to explain why it
stopped, cannot adopt browser or integration checks discovered during planning, and cannot reuse
the existing implementation for a controlled retry after findings are addressed. A real Tiny Todo
run demonstrated all three problems: the adapter lost the process outcome, plan-discovered browser
acceptance checks never became authoritative, and the only recovery path was to start over.

## What Changes

- Normalize Coding Agent failures into persisted evidence that distinguishes non-zero exit, timeout,
  cancellation, signal termination, spawn failure, and unknown process outcomes.
- Preserve bounded diagnostic head and tail content so the causal error is less likely to be lost.
- Allow a user to explicitly adopt additional verification commands from the reviewed technical
  plan at Plan approval or controlled retry; adopted commands become authoritative only through
  that explicit decision.
- Add a controlled retry operation for blocked or failed runs that creates a new workflow revision
  and can resume from Build or Verify without bypassing plan, path-scope, verification, or Review
  gates.
- Add a local run-readiness preflight through `bossflow doctor --run` and fail fast with an
  actionable message when the CLI is launched on an unsupported Node.js version.
- Preserve existing approval semantics, Worktree isolation, artifact hashes, external-action
  authorization, and the rule that an incomplete run is never reported as completed.

### Deferred

- Relocating a persisted run after the repository directory moves.
- Grouping and expanding blocking and non-blocking Review findings in `bossflow status`.
- Configuration validation and friendlier diagnostics for malformed verification settings.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `coding-agent-adapters`: require structured, normalized failure evidence from Coding Agents,
  including process outcome, bounded diagnostics, and cancellation or timeout classification.
- `workflow-runs`: permit explicitly approved plan verification additions and controlled retries
  from existing blocked or failed runs while preserving immutable prior evidence and all gates.
- `cli-interface`: expose plan verification adoption, retry operations, and local run-readiness
  diagnostics with actionable recovery guidance.

## Impact

- Core implementation and Worktree result contracts, persisted implementation and verification
  evidence, Review command authority, workflow transitions, and retry validation.
- Codex adapter process-result normalization and tests.
- CLI `doctor`, `approve`, `retry`, and Node.js bootstrap behavior.
- Run schemas, public module exports, JSON/Markdown renderers, documentation, Changesets, and
  integration tests for retry and additional verification commands.
- The low-priority path relocation, status presentation, and configuration-friendliness work is
  intentionally outside this change and is recorded as follow-up TODO.
