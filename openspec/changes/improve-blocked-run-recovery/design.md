# Design

## Context

See `proposal.md - Why` and the three capability deltas. BossFlow already treats persisted
artifacts as the source of truth, verifies artifact hashes, isolates Build in a Worktree, and
distinguishes authoritative verification commands from advisory Plan recommendations.

The current gaps cross the Core contracts, Codex adapter, Run Store, workflow orchestration, and
CLI. They therefore need one design for attempt identity and failure evidence rather than unrelated
local fixes. The TypeScript, module-boundary, security, and testing constraints are defined in
[`docs/TS_STYLE_GUIDE.md`](../../../../docs/TS_STYLE_GUIDE.md).

## Goals / Non-Goals

**Goals:**

- Make every failed Coding Agent outcome diagnosable without treating partial side effects as
  success.
- Let users turn executable checks proposed by the approved Plan into authoritative verification
  without silently expanding command authority.
- Reuse an existing blocked or failed Run through explicit, revisioned Build or Verify attempts.
- Preserve prior implementation, verification, Review, and Summary evidence for audit.
- Detect common environment problems before Build or Worktree creation.

**Non-Goals:**

- Accept free-form model or human assertions as authoritative test evidence.
- Automatically execute dynamic shell strings from models or chat.
- Add a new Coding Agent provider or change Codex model routing.
- Implement repository relocation, status presentation, or configuration-friendliness changes in
  this change.
- Authorize external Git actions during retry.

## Decisions

### Use a discriminated failure evidence contract

Add a Core contract for failed implementation evidence with these outcome kinds:

```text
nonzero-exit | timeout | canceled | signaled | spawn-error | unknown
```

The contract records only applicable values such as exit code, signal, duration, timed-out flag,
and a bounded diagnostic. Adapters normalize provider-specific process results into this shared
shape. Core remains independent of `execa` result types.

Alternative considered: store the complete provider-specific process result. Rejected because it
couples Run artifacts to an adapter library and increases the chance of persisting unstable or
sensitive fields.

### Preserve diagnostic head and tail with redaction

Diagnostics use a byte budget rather than a character-only prefix. When output exceeds the budget,
the artifact retains both ends of the redacted stderr/stdout and emits an explicit middle-omission
marker. Redaction runs before the final persistence boundary.

Alternative considered: retain only stderr. Rejected because some Coding Agents report terminal
failure details on stdout and real runs already showed useful startup diagnostics there.

### Persist exact verification authority selected from the Plan

Plan approval accepts zero or more command IDs from the current `plan.json`. The system resolves
each ID from the already validated Plan, verifies uniqueness, rejects unsupported values, and
validates the command through the existing Zod contract. The approval record stores the selected
IDs and an authoritative command snapshot.

Only selected commands are appended to the Run's effective verification set. Plan commands remain
advisory when not selected. Verification continues to execute argument arrays without a shell, and
continues to enforce a Worktree-relative `cwd` at execution time.

Existing blocked runs may select Plan commands during an explicit retry. The selection is bound to
the current Plan hash and new workflow revision rather than mutating the historical Plan approval.

Alternative considered: automatically execute every Plan command. Rejected because it expands
execution authority without explicit user approval and undermines the project-profile boundary.

Alternative considered: require a text shell override at retry time. Rejected because it bypasses
the reviewed Plan and creates a command-injection surface.

### Add attempt-aware artifact history and current-attempt resolution

Add an `attempt` value to Run metadata, defaulting to `1` for existing records. Starting a retry
increments both the attempt and workflow revision. Before a stage artifact for the new attempt is
written, the Run Store archives the prior current artifact under a stable attempt-specific name and
retains its hash in `run.json`.

Stage coordinators resolve current implementation, verification, Review, and Summary artifacts from
the latest completed attempt applicable to their stage. Historical artifacts remain readable but
cannot satisfy a current approval or current-stage recovery check.

Alternative considered: overwrite old artifacts. Rejected because it destroys the audit trail that
explains why a retry occurred.

Alternative considered: create a new Run automatically. Rejected because it loses the relationship
between prior findings and the corrected attempt, and the user explicitly asked for blocked-run
recovery.

### Retry from Build or Verify with explicit preconditions

`bossflow retry <run-id> --from build|verify` is valid only for a blocked or failed Run.

Build retry requires:

- a historical Plan approval for the current Plan artifact hash;
- an active Worktree owned by the same Run and branch;
- unchanged main-worktree identity since the original Worktree baseline;
- a new attempt with workflow revision increment.

Verify retry requires the latest completed implementation patch hash to match a fresh collection of
the Worktree diff. If code changed, the command rejects Verify retry and directs the user to Build
retry. Verify retry reuses the accepted implementation but archives prior verification, Review, and
Summary evidence.

Both origins may explicitly select Plan verification commands from the current Plan. Neither origin
creates an external-action approval.

Alternative considered: make `resume` silently reopen blocked runs. Rejected because it removes the
clear distinction between continuing an active run and starting a corrective attempt.

### Make retry preparation a Core transaction

The generic workflow graph will not expose `blocked/failed → verify`. Retry preparation moves into a
Core-owned operation that acquires one Run Store lock, revalidates the terminal stage, attempt, and
revision, archives current evidence, records the retry claim, transitions to the selected stage, and
increments the attempt before the CLI starts side effects.

This keeps approval, evidence, diff, and Worktree checks authoritative for every Core consumer rather
than only for `WorkflowService`. A second concurrent retry loses the claim and is rejected; a crash
after the claim leaves the Run in Build or Verify so normal recovery rules apply.

Alternative considered: retain the generic graph edge and repeat checks in VerificationCoordinator.
Rejected because Review can still start from incomplete implementation evidence and future callers
must remember to duplicate the entire policy.

### Run a local preflight before Build

`bossflow doctor --run` composes side-effect-free checks for:

- supported Node.js runtime;
- configuration and credential source;
- Git repository state and clean main worktree;
- unique supported package-manager lockfile;
- writable default Worktree root.

The command does not call a paid model endpoint by default. Users can run the existing model test
command separately for connectivity. The default Worktree root is checked without creating the
final run directory.

The CLI entrypoint performs the Node.js version check through a dependency-free bootstrap before
dynamically importing workflow command modules. This prevents Node.js-incompatible dependency
errors from hiding the actionable engine message.

Alternative considered: rely only on the package manifest `engines` field. Rejected because direct
execution and package-manager settings do not guarantee a consistent fail-fast message.

## Risks / Trade-offs

- **Retry could bypass an approval** → verify the current Plan hash, historical approval, Worktree
  ownership, and path scope before every retry; increment the workflow revision.
- **Attempt-aware artifacts can make recovery selection ambiguous** → use one current-attempt
  resolver with explicit stage applicability tests and immutable historical references.
- **Additional Plan commands can enlarge execution authority** → require explicit IDs, exact Plan
  definitions, Zod validation, bounded timeouts, no shell, and Worktree-contained `cwd`.
- **Diagnostic head and tail still may miss the causal line** → include explicit truncation markers,
  outcome metadata, and never claim that a bounded excerpt is complete output.
- **Preflight can disagree with the eventual environment** → label it a local snapshot and keep the
  authoritative checks in Build and Verify.
- **Existing runs have no attempt fields** → apply schema defaults so reading old runs remains
  backward compatible; never auto-retry them.
- **Required TypeScript fields can break consumers** → keep public construction contracts optional
  and normalize them internally, or publish the change as breaking with migration guidance.

## Migration Plan

1. Add optional-or-defaulted attempt metadata and failure evidence contracts with schema tests.
2. Extend the Run Store with artifact archiving and current-attempt resolution while preserving old
   artifact references.
3. Update Core implementation, verification, and Review coordinators to use the current attempt and
   reject mismatched evidence.
4. Update the Codex adapter to emit normalized failures and bounded head-tail diagnostics.
5. Add Plan verification adoption to approval and retry flows.
6. Add the retry command, revision checks, and CLI reporting.
7. Add Node.js bootstrap and `doctor --run` checks.
8. Update documentation, Changesets, integration fixtures, and conformance coverage.

Rollback is compatible for runs that were never retried. A run with new attempt fields remains
readable by the new schema; teams should not roll back to a CLI that cannot parse those fields while
that run is active.

## Open Questions

None. Manual-evidence attestation and the three deferred experience improvements are intentionally
separate follow-up changes.
