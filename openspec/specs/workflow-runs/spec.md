# workflow-runs Specification

## Purpose

Defines persisted workflow runs, stage transitions, approval gates, isolated implementation,
verification evidence, review results, and resumable completion behavior.

## Requirements

### Requirement: Persist run provenance

The system SHALL persist a unique run identifier, repository path, goal, model profile, optional model identifier, workflow stage, and timestamps for every run.

#### Scenario: Create run metadata

- **WHEN** a run is created
- **THEN** `run.json` records `schemaVersion`, `id`, `repositoryPath`, `goal`, `modelProfile`, `stage`, `createdAt`, and `updatedAt`
- **AND** records `model` when the selected runtime has an explicit model identifier

### Requirement: Initialize runs at specification stage

The system SHALL create every new run at the `spec` workflow stage and SHALL write the original goal to `request.md`.

#### Scenario: Create a new run

- **WHEN** the run store receives a non-empty goal
- **THEN** it creates a run directory named by the run ID
- **AND** the run stage is `spec`
- **AND** `request.md` contains the submitted goal

### Requirement: Enforce workflow transitions

The system SHALL allow only transitions defined by the workflow graph and SHALL reject all other transitions without mutating the original run.

#### Scenario: Advance from specification to planning

- **WHEN** a run at `spec` transitions to `plan`
- **THEN** a new run value with stage `plan` and updated timestamp is returned
- **AND** the original run remains unchanged

#### Scenario: Reject an invalid transition

- **WHEN** a run at `spec` requests a transition directly to `build`
- **THEN** the transition is rejected with the source and target stages

### Requirement: Protect run artifact paths

The system SHALL allow artifact writes only to files directly inside the selected run directory.

#### Scenario: Reject path traversal

- **WHEN** an artifact filename contains a parent-directory path such as `../escape.md`
- **THEN** the write is rejected
- **AND** no file is created outside the run directory

### Requirement: Validate generated specifications

The system SHALL require generated specifications to contain a title, problem statement, scope, non-goals, acceptance criteria, and constraints.

#### Scenario: Accept a complete specification

- **WHEN** the model returns all required specification fields
- **THEN** the specification passes local validation
- **AND** `spec.json` and `spec.md` are written

#### Scenario: Reject a specification without acceptance criteria

- **WHEN** a generated specification contains an empty acceptance-criteria array
- **THEN** validation fails and the invalid specification is not reported as successful

### Requirement: Use the project profile as the verification authority

The system SHALL execute only the verification commands persisted in the confirmed project profile.

#### Scenario: Execute the persisted command set

- **WHEN** a run enters the Verify stage
- **THEN** the system executes the commands stored in `run.json.projectProfile.verificationCommands`
- **AND** recorded results identify those commands as the authoritative executed set
- **AND** technical-plan recommendations do not add execution commands implicitly

#### Scenario: Preserve approved execution boundaries

- **WHEN** the approved technical plan contains verification recommendations not present in the
  project profile
- **THEN** the system does not execute those recommendations automatically
- **AND** the Review records them as advisory rather than as missing required evidence

### Requirement: Block only on authoritative verification failures

The system SHALL treat missing or failed authoritative verification commands as blocking.

#### Scenario: Required verification fails

- **WHEN** an authoritative required command exits non-zero
- **THEN** the run is blocked before Review
- **AND** the failing command ID and bounded evidence are persisted

#### Scenario: Advisory recommendation is not executed

- **WHEN** the plan recommends an additional check that is absent from the project profile
- **THEN** that absence alone does not create a P0 or P1 Review finding
- **AND** the Reviewer may still identify it as an advisory follow-up

### Requirement: Give Review explicit command authority context

The system SHALL give the Reviewer enough context to distinguish executed commands from advisory
recommendations.

#### Scenario: Review generated after verification

- **WHEN** the Review input is assembled
- **THEN** it includes the authoritative command IDs and their real verification evidence
- **AND** it identifies plan recommendations that were not selected for execution
- **AND** the resulting Review can map acceptance criteria without treating advisory commands as
  mandatory evidence

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

### Requirement: Capture project context before planning

The system SHALL inspect the repository before creating a run and SHALL resolve project context and verification commands into a structured project profile. The persisted project profile commands are authoritative for verification; technical-plan command recommendations MUST NOT replace or expand them implicitly.

#### Scenario: Inspect a supported project

- **WHEN** a user starts a run in a Git repository with a supported package manager
- **THEN** the system records the repository root, worktree status, package manager, languages, frameworks, conventions, test configuration, package scripts, and resolved verification commands
- **AND** it reads applicable `AGENTS.md`, README, OpenSpec, and test configuration as bounded planning context

#### Scenario: Require confirmation for ambiguous project commands

- **WHEN** required verification commands cannot be resolved or package metadata is ambiguous
- **THEN** the system refuses to create the run by default
- **AND** lists each ambiguity
- **AND** proceeds only after the user explicitly confirms or configures command overrides

#### Scenario: Keep execution commands anchored to the project profile

- **WHEN** the technical plan recommends verification commands that differ from the persisted project profile
- **THEN** verification executes the persisted project profile commands
- **AND** the Review evidence identifies the commands that actually ran

### Requirement: Persist project profile with the run

The system SHALL persist the resolved project profile in `run.json` so later stages and resume operations reuse the same repository context and verification commands.

#### Scenario: Reuse a persisted project profile

- **WHEN** an existing run is read during resume
- **THEN** its project profile is restored from `run.json`
- **AND** verification commands do not need to be inferred again

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
- **AND** the main branch HEAD, index, and tracked file content remain unchanged until an explicitly approved external action

#### Scenario: Reject a dirty main worktree

- **WHEN** worktree creation uses the default dirty strategy and the main worktree has uncommitted changes
- **THEN** the system rejects worktree creation
- **AND** reports that the user must commit or stash before continuing

#### Scenario: Clean up a retained worktree

- **WHEN** the user explicitly requests cleanup
- **THEN** the system removes the registered worktree and optionally deletes its branch
- **AND** marks the persisted worktree metadata as cleaned with a cleanup timestamp

#### Scenario: Detect orphaned managed directories

- **WHEN** the managed worktree root contains directories that are not registered Git worktrees
- **THEN** the system reports those directories as orphans
- **AND** does not delete them automatically

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

#### Scenario: Resume completed implementation

- **WHEN** a run already has `implementation.json`
- **THEN** the system reuses the persisted implementation result
- **AND** does not invoke the Implementer again

#### Scenario: Preserve terminal failures

- **WHEN** a run is failed, blocked, or awaiting approval
- **THEN** status inspection identifies the exact stage, reason, and required user action
