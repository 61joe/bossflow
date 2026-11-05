# BossFlow Agent Instructions

These instructions apply to the entire repository. Follow more specific `AGENTS.md` files in
subdirectories when present.

## Required Context

Before modifying code, read:

- `docs/PRD.md`
- `docs/TECH_STACK.md`
- `docs/TS_STYLE_GUIDE.md`
- `docs/MODEL_CONFIGURATION.md`

Read the relevant workflow documents for the affected area:

- CLI and stages: `docs/CLI_WORKFLOW.md`
- Worktree and implementation: `docs/WORKTREE_IMPLEMENTATION.md`
- Verification and Review: `docs/VERIFICATION_REVIEW.md`
- Project detection and commands: `docs/PROJECT_CONTEXT.md`
- Contribution, branches, and releases: `docs/CONTRIBUTING.md`, `docs/RELEASE.md`

If documents conflict, resolve the conflict before implementation.

## Technology Baseline

- Node.js 24+ and pnpm 12+
- TypeScript 6 with ESM and NodeNext
- OpenAI Agents SDK JS and Zod
- Commander, Jest, ESLint, and Prettier
- Codex is the first Coding Agent adapter, not a Core dependency

## Repository Architecture

```text
packages/
├── core/       # Workflow, contracts, stores, Git, verification, Review
├── adapters/   # Concrete Coding Agent integrations
└── cli/        # Commands, composition, and user-facing orchestration
```

Dependency direction:

```text
cli ──→ adapters ──→ core
└──────────────────→ core
```

- Core must not import CLI or a concrete adapter.
- Adapters must not import CLI.
- CLI may compose Core and Adapters.
- CLI owns user-facing exit codes, prompts, rendering, and composition.
- Adapter execution details, prompts, process limits, and provider-specific failure normalization
  belong under `packages/adapters`.

## Security And Runtime Safety

- Never write API keys into `.bossflow/config.yaml`, CLI arguments, logs, chat output, or Run
  artifacts.
- Manage local credentials only through `bossflow auth`.
- `.bossflow/credentials.local.yaml` must remain Git-ignored with mode `0600`.
- Redact secrets before persisting command output, diagnostics, diffs, Review results, and summaries.
- Execute Shell commands with executable plus argument arrays; do not use shell-string execution.
- Validate all paths and keep implementation writes inside the approved Worktree scope.
- Do not infer success from changed files. A Coding Agent completion requires a trustworthy process
  result and explicit evidence.
- Do not edit hashed Review, Verification, Summary, or implementation artifacts to remove findings.
- Do not manually rewrite terminal Run state. Use status, evidence, and controlled Retry.
- External Git actions require explicit user authorization for the exact actions requested.

## Run State And Evidence

- Persisted Run artifacts are the source of truth; chat history is not.
- Never describe `plan_approval`, `review_approval`, `blocked`, or `failed` as completed.
- Only `run.json.stage === "completed"` permits a completed-workflow claim.
- Preserve superseded evidence as `attempt-<n>-*`.
- Use active, non-superseded artifacts for current-stage recovery and approval.
- Keep Retry preparation atomic and reject stale stage, attempt, revision, or updatedAt values.
- Approval records must reference the current artifact revision and SHA-256.

## OpenSpec

Behavior changes require an OpenSpec change containing the applicable proposal, spec delta, design,
and tasks:

```text
pnpm spec:list
pnpm spec:validate
```

- Inspect existing capabilities under `openspec/specs/` before proposing a new one.
- Reuse existing capability paths when requirements change.
- Implement behavior through an OpenSpec apply workflow.
- Archive a change only after implementation, verification, Review, and explicit human acceptance.
- Do not invent spec deltas solely to satisfy validation; pure refactors should not change runtime
  behavior.

## Required Commands

Before committing, run:

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm spec:validate
```

Use `pnpm check` for format, lint, typecheck, tests, and build, then run `pnpm spec:validate`
separately.

Run real Codex conformance only when the change affects adapter execution, process handling, or end
to end workflow behavior:

```text
pnpm conformance:codex -- --scenario <scenario-id>
```

Conformance evidence must remain sanitized and describe the actual outcome. Do not report a blocked
run as successful.

## Git And Release

- Do not commit, push, merge, or create a PR unless the user explicitly authorizes the exact action.
- Do not work directly on `main` or `master`.
- Use `feat-`, `fix-`, or `chore-` branch names.
- Do not bypass Husky or use `--no-verify` unless explicitly requested.
- Use Changesets for release-impacting behavior and public package changes.
- Do not create a Release from a feature PR.

## Completion Checklist

- Behavior matches the approved specification and Plan.
- Tests cover success, failure, cancellation, boundary, and recovery paths.
- Security and artifact-redaction requirements are preserved.
- Full required commands pass.
- Final report lists actual changes, verification commands and results, residual warnings, and
  unfinished work.
