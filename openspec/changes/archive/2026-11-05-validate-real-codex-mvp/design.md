# Design

## Context

See `proposal.md - Why`. The current fake-Coding-Agent smoke and integration suite are deterministic
and suitable for CI, but they cannot exercise Codex CLI authentication, real workspace edits, or
real review quality. BossFlow already has disposable repository fixtures and a real-provider smoke
for reasoning roles.

## Goals / Non-Goals

**Goals:**

- Exercise the actual Codex Coding Agent through the normal BossFlow workflow.
- Make evidence collection repeatable and reviewable without requiring a database.
- Keep real-agent validation manual because it uses external authentication, network access, time,
  and model quota.
- Produce enough evidence to decide whether a task succeeded or failed before more product breadth
  is added.

**Non-Goals:**

- Scoring model intelligence or promising a task success rate.
- Running real Codex in pull-request CI.
- Automating commit, push, merge, or PR creation.
- Validating non-Codex Coding Agents in this change.

## Decisions

### Use a dedicated manual conformance command

Add a conformance entry point separate from `pnpm check`, tentatively
`pnpm conformance:codex`. It creates a disposable repository, runs the normal BossFlow CLI workflow
with the real Codex adapter, and writes a machine-readable result.

Alternative considered: add actual Codex execution to `pnpm check`. Rejected because normal CI must
remain deterministic and must not require Codex authentication or external model quota.

### Keep fixture profiles explicit

At minimum, the initial campaign covers a single-package TypeScript project and one additional
project profile such as a multi-package workspace or a simpler JavaScript project. Fixtures remain
dynamic and disposable so nested `.git` directories are not committed.

Alternative considered: commit initialized fixture repositories. Rejected because generated Git
metadata is noisy and brittle.

### Store sanitized campaign evidence separately from run artifacts

Each conformance record includes adapter ID, project profile, run ID, actual stage, outcome, changed
paths, verification results, Review findings, user interventions, and authorized external actions.
The record must not include credentials, environment dumps, or unsanitized command secrets.

The harness writes a local report for inspection. Only sanitized summary evidence is committed, for
example under `docs/conformance/`, after human review.

Alternative considered: copy complete run directories into the repository. Rejected because diffs
and command output can contain unrelated or sensitive repository data.

### Use the normal workflow path

The conformance command calls the same run, approve, and resume behavior as users. It does not seed
intermediate stages or bypass approvals. A separate manual checklist verifies that the installed
`$bossflow` Skill invokes the CLI correctly from Codex Desktop.

Alternative considered: test only the Coding Agent adapter in isolation. Rejected because it would
miss worktree, verification, and approval integration failures.

## Risks / Trade-offs

- Real Codex output is nondeterministic → report facts and failures instead of asserting a fixed
  implementation diff.
- External model cost and quota are required → keep the command manual and allow a configurable
  campaign size.
- A small campaign may not represent all repositories → record project profiles and avoid claiming
  universal compatibility.
- Failure runs may retain a worktree → provide explicit cleanup or `--keep-on-failure` behavior and
  document how to inspect evidence safely.
- Desktop Skill behavior cannot be fully automated → require a human checklist record for the Skill
  entry path.
