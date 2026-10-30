## ADDED Requirements

### Requirement: Generate a structured technical plan

The system SHALL generate and persist a technical plan after the specification stage and before implementation.

#### Scenario: Generate a plan

- **WHEN** a run advances from `spec` to `plan` with valid model credentials
- **THEN** the system invokes the Tech Lead role with the specification and repository context
- **AND** validates the result with a plan Schema
- **AND** writes `plan.json` and a readable `plan.md`

#### Scenario: Reject an invalid plan

- **WHEN** the generated plan lacks tasks, affected paths, verification commands, or risks
- **THEN** the stage fails
- **AND** the run remains at `plan`
- **AND** the failure is recorded without entering implementation

### Requirement: Gate implementation behind plan approval

The system SHALL refuse to create a worktree or modify business files until the user has approved the current specification and plan revision.

#### Scenario: Require plan approval

- **WHEN** a plan is complete but has not been approved
- **THEN** the run can advance only to the approval gate
- **AND** Build actions are rejected

#### Scenario: Record approval

- **WHEN** the user approves the current spec and plan revision
- **THEN** the system records the approval decision, timestamp, user, and approved revision in run metadata

#### Scenario: Reject stale approval

- **WHEN** the plan changes after approval
- **THEN** the previous plan approval no longer authorizes Build

### Requirement: Isolate implementation in a Git worktree

The system SHALL perform implementation and verification in a dedicated Git worktree rather than the main working tree.

#### Scenario: Create an implementation worktree

- **WHEN** an approved plan enters `build`
- **THEN** the system creates or reuses an idempotent worktree for the run
- **AND** records the worktree path, base commit, and branch in run metadata

#### Scenario: Preserve the main worktree

- **WHEN** the Implementer changes files
- **THEN** those changes appear only in the run worktree
- **AND** the configured main working tree remains unchanged

#### Scenario: Reject out-of-scope paths

- **WHEN** the implementation diff changes a path outside the approved task scope
- **THEN** the stage is marked blocked
- **AND** the unexpected paths are recorded for user review

### Requirement: Verify with real command evidence

The system SHALL execute configured lint, typecheck, test, and build commands and persist their real exit status and bounded output.

#### Scenario: Capture successful verification

- **WHEN** all configured verification commands exit successfully
- **THEN** `verification.json` and `verification.md` record each command, duration, and successful exit code

#### Scenario: Stop on command failure

- **WHEN** a required verification command exits non-zero
- **THEN** Review is not entered automatically
- **AND** the run is marked blocked or failed with the failing command and bounded output

#### Scenario: Redact command output

- **WHEN** command output contains an environment secret or credential
- **THEN** the persisted evidence redacts the secret value

### Requirement: Produce independent review and requirement mapping

The system SHALL invoke a Reviewer role independently from the Implementer and SHALL map specification acceptance criteria to implementation and verification evidence.

#### Scenario: Generate review findings

- **WHEN** verification evidence is available
- **THEN** the Reviewer receives the specification, approved plan, diff summary, and verification results
- **AND** writes structured review findings and a requirement coverage map

#### Scenario: Block on unresolved high-severity findings

- **WHEN** review contains an unresolved high-severity finding
- **THEN** the run cannot enter the final review approval gate as complete
- **AND** the finding is surfaced to the user

### Requirement: Summarize and resume workflow state

The system SHALL persist a final summary and SHALL allow an interrupted run to resume from its last completed stage without repeating completed side effects.

#### Scenario: Produce a final summary

- **WHEN** Review and required gates are complete
- **THEN** `summary.md` lists completed work, artifacts, verification evidence, review findings, remaining risks, and pending external actions

#### Scenario: Resume an interrupted run

- **WHEN** the user resumes a non-terminal run
- **THEN** the system reloads persisted state and continues from the first incomplete stage
- **AND** completed commands and worktree creation are not duplicated

#### Scenario: Preserve terminal failures

- **WHEN** a run is failed, blocked, or awaiting approval
- **THEN** status inspection identifies the exact stage, reason, and required user action
