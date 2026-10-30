## Context

The baseline implementation validates a goal, creates a run, invokes the Product Agent, and persists `spec.json` and `spec.md`. Workflow stages after `spec` exist as transition data, but no Planner, Implementer, Reviewer, approval ledger, worktree lifecycle, or verification runner is connected.

The PRD requires a controlled development loop. It also requires that no business code is modified before scope and plan approval, implementation happens in an isolated worktree, verification uses real commands, review is independent, and commit/push/PR operations require explicit approval.

The existing stack already includes OpenAI Agents SDK JS, Zod, `simple-git`, `execa`, Commander, and a file-based Run Store. The design should activate those components rather than introduce a workflow platform or database.

## Goals / Non-Goals

**Goals:**

- Complete the Spec → Plan → Build → Verify → Review → Summary workflow.
- Persist every stage result and approval as structured run data.
- Preserve main Agent control and call specialist Agents as tools.
- Prevent implementation before plan approval.
- Isolate implementation in a Git worktree.
- Capture real command output, Git diff, requirement coverage, and review findings.
- Support status inspection and resume after interruption.
- Make Codex Skill installation and stage reporting explicit.

**Non-Goals:**

- Fully unattended product delivery.
- Concurrent multi-run scheduling or distributed workers.
- Automatic commit, push, merge, or PR creation without a separate approval.
- Frontend/backend as always-on separate agents.
- Replacing OpenSpec, Codex, or the selected model runtime.
- Provider-independent native JSON Schema support guarantees.

## Decisions

### Use the existing finite workflow with explicit gates

Add `plan_approval` and `review_approval` concerns to the current stage model instead of introducing a general graph engine. The main orchestrator owns transitions; specialist Agents return structured results.

Alternative considered: let specialist Agents hand off control to each other. Rejected because stage gates, approvals, retries, and evidence need one controller.

### Persist approvals and artifacts under the Run ID

Extend `run.json` with workflow revision, approval records, worktree metadata, and artifact references. Write stage outputs as separate JSON/Markdown files. `run.json` remains the index; stage artifacts remain the evidence.

Alternative considered: store everything in one growing JSON document. Rejected because it is difficult to review, recover, and diff.

### Use Agent-as-tool for specialist roles

Define Product, Tech Lead, Implementer, and Reviewer Agents with structured output Schemas. The orchestrator activates only the roles required by the current stage. The Implementer receives constrained paths and tool permissions from the approved plan.

Alternative considered: four permanently active agents. Rejected because it increases context cost and blurs responsibility.

### Execute implementation in a dedicated worktree

Create `.bossflow/worktrees/<run-id>` or a sibling worktree from the current HEAD. Record its path and branch. Build and verification operate inside that worktree. The main working tree remains untouched.

Alternative considered: edit the current working tree directly. Rejected because it conflicts with the required safety boundary and makes cleanup/rollback difficult.

### Treat commands as evidence-producing adapters

Use `execa` for configured lint, typecheck, test, and build commands. Capture command, exit code, duration, bounded stdout/stderr, and redaction status. Model assertions cannot replace command results.

Alternative considered: let the Reviewer Agent infer test success from code. Rejected because only real command execution can establish evidence.

### Keep external Git actions behind a separate approval

Review completion produces a diff and summary but does not commit by default. Commit, push, merge, and PR creation require a new user approval and are recorded independently.

Alternative considered: commit automatically after tests pass. Rejected because the PRD reserves external side effects for the user.

## Risks / Trade-offs

- Prompt-directed JSON providers may return malformed output → use shared Zod validation and bounded retry with validation feedback.
- Worktree creation can fail on dirty repositories → detect status first and fail with a recovery message rather than editing main.
- Command output may contain secrets → use bounded buffers and a shared redaction pass before persistence.
- Large diffs can exceed model context limits → persist the full diff and send selected hunk summaries to Reviewer.
- Implementer Agents may edit outside approved scope → validate changed paths against the plan after execution.
- Resume can duplicate side effects → checkpoint stage completion before enabling the next stage and make worktree creation idempotent.
- Model/provider behavior varies → reuse the existing model probe and provider compatibility mode.

## Migration Plan

1. Extend schemas and Run Store with backward-compatible optional metadata.
2. Add role agents and orchestration while keeping the current specification-only path available with `--stop-after spec`.
3. Add worktree and verification adapters behind the plan-approval gate.
4. Add review, summary, status, approval, and resume CLI operations.
5. Update the Codex Skill and documentation.
6. Validate against fixture repositories before running on real projects.
7. Roll back by reverting the change and leaving existing run artifacts readable through optional fields.

## Open Questions

- Should approval prompts be interactive by default or require explicit command arguments for automation?
- Should verification commands be auto-detected or confirmed and persisted during initialization?
- Which changed-path rules are sufficient for monorepos with generated files?
