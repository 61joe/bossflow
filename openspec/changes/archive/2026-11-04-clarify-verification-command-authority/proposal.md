# Proposal

## Why

Verification currently executes only the persisted project-profile commands, while the approved
technical plan also contains model-generated verification recommendations. The Reviewer receives
the plan and can block on commands that BossFlow never intended to execute, causing false failures
and making it unclear which commands are authoritative.

## What Changes

- Define persisted project-profile verification commands as the only authoritative execution set.
- Treat technical-plan verification commands as recommendations that may inform Review but do not
  silently expand execution permissions.
- Give the Reviewer explicit evidence about which authoritative commands actually ran.
- Require missing or failed authoritative commands to remain blocking.
- Require non-executed advisory checks to be identified as advisory rather than represented as
  missing required evidence.
- Preserve backward compatibility for existing `run.json`, `plan.json`, and Review artifacts.
- Do not automatically execute model-proposed commands outside the approved project profile.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workflow-runs`: clarify verification command authority and how Review interprets executed versus
  advisory checks.

## Impact

- Core contracts: Technical Plan and Reviewer input semantics.
- Verification and Review coordinators.
- Workflow tests and real-model smoke tests.
- OpenSpec `workflow-runs` requirements and technical documentation.
- No new dependencies or data-store migration.
