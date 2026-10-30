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
