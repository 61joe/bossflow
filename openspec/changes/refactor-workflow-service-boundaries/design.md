# Design

## Context

See `proposal.md - Why`. The current CLI service already delegates Build, Verify, Review, and Retry
internals to Core coordinators. The remaining coupling is inside the CLI workflow module:
Run evidence access, planning persistence, stage chaining, approvals, status policy, Retry option
handling, and user-facing errors share one class.

The public `WorkflowService` constructor and methods are consumed by CLI command handlers,
integration tests, and `@bossflow/cli` public exports. They must remain stable throughout the
refactor.

## Goals / Non-Goals

**Goals:**

- Keep `WorkflowService` as a thin public facade and composition root.
- Create capability-based internal services with one reason to change each.
- Preserve observable behavior, exit codes, artifacts, approvals, and stage transitions.
- Remove the `max-lines` exception from `workflow-service.ts`.
- Keep internal dependencies acyclic and visible through constructor injection.
- Preserve 100% coverage with focused unit tests for extracted policy and access modules.

**Non-Goals:**

- Change persisted schemas, CLI commands, or workflow semantics.
- Move CLI-specific error rendering into Core.
- Rewrite the Core coordinators.
- Add inheritance, generic service locators, or dependency-injection frameworks.
- Split every stage into a separate file.

## Decisions

### Keep WorkflowService as a facade

`WorkflowService` retains the existing public methods and options but delegates:

- `run`: planning plus initial Run creation.
- `resume`: resume pipeline.
- `retry`: Retry preparation plus resume pipeline.
- `approve`: approval service.
- `status`: status service.
- `getRun`: Run evidence access.

Alternative considered: expose the capability services publicly. Rejected because it expands the
package API and forces callers to understand composition.

### Organize by capability rather than by stage

Internal files:

```text
workflow-service.ts
run-evidence.ts
planning-service.ts
resume-pipeline.ts
approval-service.ts
retry-service.ts
status-service.ts
plan-verification-policy.ts
workflow-error-mapper.ts
```

`ResumePipeline` owns the stage dispatch and Build → Verify → Review chain. Splitting each stage
into a separate file would create small wrappers with repeated dependencies.

### Centralize Run and evidence access

`WorkflowRunEvidence` owns:

- Run-not-found error translation.
- Active artifact lookup.
- Required and optional artifact reads.
- SHA-256 verification.
- Specification, Plan, Verification, and Review schema parsing.

Domain services receive validated evidence instead of duplicating file and JSON handling.

### Isolate pure approval and verification policy

`PlanVerificationPolicy` owns command ID normalization, duplicate/unknown/conflicting checks,
command equality, and approved command snapshots. `ApprovalService` owns current/historical approval
queries and ApprovalRecord creation, including external-action deduplication.

Alternative considered: keep approval queries in ResumePipeline. Rejected because Status and
Approval also need the same rules.

### Keep Retry validation in Core and CLI adaptation separate

`RetryService` only:

- Parses optional CLI verification selections.
- Invokes Core `RetryCoordinator`.
- Maps `RetryError` into CLI exit codes.

It does not duplicate Worktree, patch, fingerprint, or atomic claim validation.

### Keep Status read-only and reuse Retry inspection

`StatusService` consumes `WorkflowRunEvidence`, `ApprovalService`, and `RetryCoordinator.inspect`.
It never mutates Run state and never guesses a Retry origin that Core would reject.

### Use composition through explicit constructor dependencies

The facade constructs internal services from `WorkflowServiceOptions`. Extracted services receive
only their concrete dependencies: store, clock, ID generator, generators, implementer, Worktree
manager, renderers, or policies. No module-level singleton is introduced.

## Risks / Trade-offs

- **Error precedence changes during extraction** → preserve existing failure-order characterization
  tests, especially artifact integrity before approval checks.
- **Services form cycles** → direction is Evidence/Policy → Planning/Approval → Resume/Retry/Status →
  Facade; no lower module imports the facade.
- **Refactor expands file count** → use capability-level files, not one file per method.
- **Coverage drops during partial moves** → move code with its tests in dependency order and run
  focused tests after each phase.
- **Retry and Status drift** → both use Core `RetryCoordinator`; Status never owns a second policy.
- **Public API accidentally changes** → `workflow/index.ts` exports stay unchanged until the refactor
  is verified.

## Migration Plan

1. Extract pure Plan verification and error mapping.
2. Extract Run evidence access and typed artifact reads.
3. Extract ApprovalService.
4. Extract PlanningService.
5. Extract ResumePipeline.
6. Extract RetryService and StatusService.
7. Reduce WorkflowService to facade composition.
8. Remove the file-length exception, run focused tests after each phase, then run
   `pnpm check` and `pnpm spec:validate`.

Rollback is file-local because public APIs and persisted formats remain unchanged.

## Open Questions

None.
