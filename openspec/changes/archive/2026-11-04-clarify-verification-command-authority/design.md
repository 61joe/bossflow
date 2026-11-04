# Design

## Context

See `proposal.md - Why`. `run.json` persists the confirmed project profile and its verification
commands. Verify executes that profile command set. Review loads the approved plan, including its
verification recommendations, and currently has no explicit signal separating those recommendations
from the commands that actually ran.

## Goals / Non-Goals

**Goals:**

- Preserve the confirmed project profile as the execution authority.
- Let the plan provide useful additional checks without silently granting execution permission.
- Make Review evidence explicit and testable.
- Keep existing run, plan, and Review artifacts readable.

**Non-Goals:**

- Adding a command policy engine or shell allowlist.
- Executing arbitrary approved plan commands.
- Replacing the project command resolver.
- Changing npm, release, or CI behavior.

## Decisions

### Keep project-profile commands authoritative

`run.json.projectProfile.verificationCommands` remains the only set BossFlow executes. This avoids
turning model-generated plan content into executable permissions and preserves the command override
and confirmation semantics already implemented by project inspection.

Alternative considered: merge approved plan commands into the profile before Verify. Rejected for
this change because it expands the execution surface, complicates cwd/path validation, and turns plan
approval into implicit shell permission.

### Preserve the plan field as advisory

`TechnicalPlan.verificationCommands` remains in the schema for backward compatibility, but its
runtime semantics are explicitly advisory. Advisory commands do not affect run blocking unless a
future change introduces an explicit promotion workflow.

Alternative considered: rename or remove the field immediately. Rejected because existing
`plan.json` artifacts would break and the change would become unnecessarily disruptive.

### Build an explicit Reviewer verification context

Before Review, derive a verification context containing:

- authoritative commands from the persisted project profile;
- command IDs and results actually recorded by Verify;
- plan recommendations not selected for execution;
- any authoritative commands whose required evidence is absent.

Pass this context with the existing Specification, Plan, Diff, and verification evidence. Reviewer
instructions distinguish blocking authoritative failures from advisory follow-ups.

Alternative considered: change only the Reviewer prompt while keeping the same input. Rejected
because the model would still have to infer authority from overlapping command data.

### Keep recovery compatible

The context is derived at Review time from existing persisted data. No new required field is added
to `run.json`, `plan.json`, or `review.json`, so existing runs remain resumable. Optional additions
to API types must have defaults for existing fixtures.

Alternative considered: persist a new verification policy artifact. Deferred because current profile
and plan data already contain enough information.

## Risks / Trade-offs

- Advisory checks may be ignored by users → Review and status output should label them clearly.
- Matching commands by ID alone can hide command changes → compare ID plus command, arguments, and
  cwd when determining whether a plan recommendation was executed.
- Model Reviewer behavior can remain inconsistent → add explicit instructions and deterministic
  tests with fake Review inputs.
- Existing Review artifacts may lack the new context → recover them without modifying historical
  hashes.

## Migration Plan

1. Add backward-compatible contract fields and derivation helpers.
2. Populate Reviewer context without requiring new persisted metadata.
3. Update prompts and tests.
4. Validate against existing fixtures and a real-model smoke.
5. Roll back by ignoring the optional context and returning to profile-only execution; no data
   migration is required.
