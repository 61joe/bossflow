# Proposal

## Why

BossFlow's automated integration coverage currently uses a fake Coding Agent, so it proves
workflow orchestration but does not prove that the supported Codex Adapter can complete real
development tasks. The PRD requires validation against at least three real tasks before treating
the MVP workflow as usable.

## What Changes

- Add a repeatable Coding Agent conformance workflow that runs the supported Codex integration
  against disposable real Git repositories.
- Require at least three representative tasks across at least two project profiles.
- Record evidence for the run stage, implementation diff, real verification commands, Review
  findings, user interventions, and external-action authorization.
- Require failures to be reported with the first incomplete stage and preserved evidence.
- Require the conformance run to use the same CLI, Skill, worktree, verification, and approval
  paths used by normal users.
- Do not treat model quality, task success rate, or unsupported language coverage as acceptance
  criteria for this change.

## Capabilities

### New Capabilities

- `coding-agent-conformance`: defines how supported Coding Agent integrations are validated with
  real repositories and real coding-agent executions.

### Modified Capabilities

None.

## Impact

- Tests and tooling: real Coding Agent conformance harness and disposable repository fixtures.
- Adapters: Codex integration runs without a fake Coding Agent.
- CLI and workflow: normal `$bossflow`/CLI workflow stages and approval boundaries.
- Documentation: `docs/PRD.md`, `docs/TEST_STRATEGY.md`, and acceptance evidence.
- No new service, database, queue, npm publication, or automatic external Git action.
