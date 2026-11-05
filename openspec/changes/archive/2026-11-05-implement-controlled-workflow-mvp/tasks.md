## 1. Workflow Contracts

- [x] 1.1 Define Zod schemas and TypeScript types for technical plans, task items, approvals, worktree metadata, verification commands, verification results, review findings, requirement coverage, and summaries.
- [x] 1.2 Extend `WorkflowRun` and `run.json` with backward-compatible workflow revision, approval ledger, worktree references, artifact references, and terminal failure state.
- [x] 1.3 Add explicit plan-approval and review-approval gates to the workflow transition model.
- [x] 1.4 Persist workflow state atomically and make stage transitions idempotent for retries and resume.
- [x] 1.5 Add a shared secret-redaction utility for command output, errors, run artifacts, and summaries.

## 2. Specialist Agents

- [x] 2.1 Implement the Tech Lead Agent with a structured technical-plan Schema covering affected paths, ordered tasks, interface changes, risks, and verification commands.
- [x] 2.2 Implement the Implementer Agent with approved scope, write-path restrictions, test expectations, and structured implementation results.
- [x] 2.3 Implement the Reviewer Agent with diff, verification evidence, requirement coverage, severity, and unresolved-finding output.
- [x] 2.4 Add an orchestrator that calls Product, Tech Lead, Implementer, and Reviewer through `agent.asTool()` while retaining stage control.
- [x] 2.5 Reuse provider compatibility parsing and add bounded validation-feedback retries for malformed plan or review JSON.
- [x] 2.6 Define an explicit single-Agent fallback when specialist Agent capability detection fails.

## 3. Project Context And Commands

- [x] 3.1 Detect repository root, Git status, package manager, language/framework files, and existing project conventions.
- [x] 3.2 Read applicable `AGENTS.md`, README, OpenSpec context, package scripts, and test configuration as planning context.
- [x] 3.3 Detect and validate lint, typecheck, test, and build commands, with user confirmation for ambiguous repositories.
- [x] 3.4 Add project configuration for required verification commands, timeout budgets, and optional command overrides.
- [x] 3.5 Persist the resolved project profile with the run so resume uses the same context and commands.

## 4. Worktree And Implementation

- [x] 4.1 Implement idempotent Git worktree creation using `simple-git`, including worktree path, branch, and base-commit metadata.
- [x] 4.2 Reject or safely handle dirty repositories according to the approved worktree strategy.
- [x] 4.3 Connect the Implementer only after a valid plan approval and run all writes inside the run worktree.
- [x] 4.4 Compute the implementation diff and validate changed paths against the approved scope.
- [x] 4.5 Persist implementation notes and full patch/diff references without copying sensitive files.
- [x] 4.6 Add worktree cleanup, retention, and orphan detection behavior with explicit user control.
- [x] 4.7 Validate resume behavior so completed worktree creation and implementation effects are not duplicated.

## 5. Verification, Review, And Summary

- [x] 5.1 Implement a command runner using `execa` with argument arrays, timeouts, AbortSignal, bounded output, and real exit codes.
- [x] 5.2 Persist `verification.json` and `verification.md` with command, duration, status, and redacted output.
- [x] 5.3 Stop the workflow on required command failure and record an actionable blocked or failed state.
- [x] 5.4 Feed the specification, approved plan, diff summary, and verification evidence to the Reviewer Agent.
- [x] 5.5 Write structured review findings and map each acceptance criterion to implementation and verification evidence.
- [x] 5.6 Prevent review completion when unresolved high-severity findings remain.
- [x] 5.7 Generate `summary.md` with completed work, evidence, review status, remaining risks, and pending external actions.

## 6. CLI And Approvals

- [x] 6.1 Change `bossflow run` to generate specification and technical plan, then stop at the plan-approval gate by default.
- [x] 6.2 Add `bossflow run --stop-after spec` to preserve specification-only execution.
- [x] 6.3 Add `bossflow status <run-id>` with persisted stage, approvals, artifacts, verification, review, and next action.
- [x] 6.4 Add `bossflow approve <run-id> --gate plan` with revision-aware approval recording.
- [x] 6.5 Add `bossflow approve <run-id> --gate review` for explicitly requested commit, push, merge, or PR actions.
- [x] 6.6 Add `bossflow resume <run-id>` that continues only from the first incomplete stage and never bypasses a gate.
- [x] 6.7 Define stable non-zero exit codes and user-facing recovery messages for blocked, failed, missing, and unapproved runs.
- [x] 6.8 Update CLI help and documentation for the new commands and default behavior change.

## 7. Codex Adapter

- [x] 7.1 Add an installer that copies the BossFlow Codex Skill into the supported target-project Skill location without overwriting unrelated Skills.
- [x] 7.2 Update the Skill to create or resume persisted runs using the current CLI contract.
- [x] 7.3 Require the Skill to inspect `run.json` approvals before implementation or external Git actions.
- [x] 7.4 Require the Skill to report the actual stage, pending action, and incomplete evidence instead of claiming later stages are complete.
- [x] 7.5 Add adapter tests for installation idempotency, collision handling, and unsafe path rejection.

## 8. Verification And Rollout

- [x] 8.1 Create fixture repositories for clean, dirty, multi-package, missing-command, and failing-verification scenarios.
- [x] 8.2 Add fake model/tool implementations so workflow tests require no network or paid model calls.
- [x] 8.3 Add unit tests for schemas, gates, transitions, path-scope validation, redaction, and resume idempotency.
- [x] 8.4 Add integration tests covering Spec → Plan → approval → worktree → Verify → Review → Summary.
- [x] 8.5 Add failure tests for malformed plans, command failures, review blockers, interrupted runs, and stale approvals.
- [x] 8.6 Verify that main worktree files and Git metadata remain unchanged until the explicitly approved external action.
- [x] 8.7 Run one real-model smoke workflow against a disposable fixture repository.
- [x] 8.8 Update PRD acceptance status, technical documentation, and OpenSpec behavioral specs.
- [x] 8.9 Run `pnpm check` and `pnpm spec:validate`.
