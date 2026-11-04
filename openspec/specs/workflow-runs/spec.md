# workflow-runs Specification

## Purpose

TBD - created by archiving change bootstrap-bossflow-baseline. Update Purpose after archive.

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
