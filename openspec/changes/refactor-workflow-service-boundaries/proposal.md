# Proposal

## Why

`WorkflowService` is now approximately 870 lines and changes for lifecycle orchestration, planning,
execution, approvals, persisted evidence access, Retry policy, and status rendering. This makes a
small stage change require navigating unrelated concerns and leaves high complexity around
approval and Retry behavior. The current public behavior is already covered, so the boundaries can
be extracted incrementally without changing the workflow contract.

## What Changes

- Keep `WorkflowService` as the stable public facade and composition root.
- Extract persisted Run and artifact access, including hash and schema validation, into a dedicated
  Run evidence component.
- Extract Specification and Plan generation, rendering, persistence, and project-context loading
  into a planning component.
- Extract stage resume and Build → Verify → Review chaining into a resume pipeline.
- Extract Plan/Review approval and external-action recording into an approval component.
- Extract Retry option handling and Core `RetryCoordinator` invocation into a Retry component.
- Extract status reporting and next-action policy into a status component.
- Extract Plan verification adoption into a pure policy component.
- Centralize CLI workflow error translation.
- Preserve all public `WorkflowService` methods, constructor options, exit codes, artifacts,
  approval semantics, and stage transitions.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cli-interface`: require public workflow command behavior and recoverable errors to remain
  compatible across an internal WorkflowService decomposition.

## Impact

- CLI workflow implementation files and their focused unit tests.
- `WorkflowService` internal dependency composition.
- No public package API, CLI command, persisted schema, Core workflow behavior, or runtime artifact
  format changes.
