# Tasks

## 1. Characterization And Pure Policies

- [x] 1.1 Record the current public `run`, `resume`, `retry`, `approve`, and `status` behavior through the existing focused and integration tests, then run them before extraction; verify all tests and 100% coverage pass unchanged.
- [x] 1.2 Extract Plan verification command adoption, duplicate/unknown/conflict checks, command equality, and idempotent ID comparison into `plan-verification-policy.ts`; verify focused policy tests preserve current usage errors and project-profile output.
- [x] 1.3 Extract Retry error-to-CLI-exit-code mapping and run-not-found translation into `workflow-error-mapper.ts`; verify existing exit-code and recovery-message tests remain unchanged.

## 2. Run Evidence Access

- [x] 2.1 Create `run-evidence.ts` for Run reads, active artifact lookup, optional/required reads, SHA-256 checks, and typed Specification/Plan/Verification/Review parsing; verify focused tests cover missing artifacts, modified artifacts, invalid JSON, and active superseded artifacts.
- [x] 2.2 Replace WorkflowService evidence access helpers with the new component while preserving error precedence and messages; verify CLI and workflow integration tests still pass.

## 3. Approval Capability

- [x] 3.1 Extract current/historical approval lookup, approval record creation, external action deduplication, and approval-gate checks into `approval-service.ts`; verify focused tests cover Plan, Review, stale revisions, missing artifacts, and idempotent actions.
- [x] 3.2 Reduce `WorkflowService.approve` to parameter validation and approval-service delegation; verify approval complexity drops below the configured limit and all CLI approval tests pass.

## 4. Planning Capability

- [x] 4.1 Extract Specification persistence, Technical Plan generation/persistence, plan transitions, and project-context loading into `planning-service.ts`; verify focused tests cover stop-after-spec, existing plan recovery, missing project profile, and plan transition failure.
- [x] 4.2 Replace WorkflowService planning helpers with PlanningService; verify run and resume integration tests preserve artifact paths, rendered content, and stage outcomes.

## 5. Resume Pipeline

- [x] 5.1 Extract active-stage dispatch and Build → Verify → Review chaining into `resume-pipeline.ts`, keeping Core coordinators and existing error mapping; verify the complete stage matrix and failure paths.
- [x] 5.2 Support resuming from a Retry-prepared active Run without duplicating Retry policy; verify Build and Verify retry integration tests still reach Review approval.
- [x] 5.3 Reduce `WorkflowService.resume` to facade delegation; verify all resume and integration tests remain unchanged.

## 6. Retry And Status Capabilities

- [x] 6.1 Extract optional Plan verification selection, Core RetryCoordinator invocation, and Retry option handling into `retry-service.ts`; verify retry and CLI tests preserve RetryError exit codes and atomic claim behavior.
- [x] 6.2 Extract StatusReport construction and next-action policy into `status-service.ts`, including authoritative Retry inspection; verify every workflow stage and valid/invalid Retry origin.
- [x] 6.3 Reduce `WorkflowService.retry` and `WorkflowService.status` to delegation; verify their public method signatures remain unchanged.

## 7. Facade Cleanup And Verification

- [x] 7.1 Reduce `WorkflowService` to constructor composition, `getRun`, `run`, and public-method delegation, and remove the file-level `eslint-disable max-lines`; verify the file has fewer than 200 lines and no private workflow policy remains.
- [x] 7.2 Verify internal dependency direction has no cycles and `workflow/index.ts` public exports are unchanged; run the existing module-boundary and import checks.
- [x] 7.3 Run `pnpm check`, `pnpm spec:validate`, and `git diff --check`; verify format, lint, typecheck, 379+ tests, 100% coverage, build, strict OpenSpec validation, and no whitespace errors.

## Workflow follow-up

- Archive this change after behavior-preserving verification and explicit human acceptance.
- Do not commit, push, merge, or create a pull request without explicit user authorization.
