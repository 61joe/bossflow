## MODIFIED Requirements

### Requirement: Generate a specification run

The system SHALL create a persisted run, generate a validated specification, generate a technical plan, and stop at the plan-approval gate by default. The system MUST preserve specification-only execution through an explicit `--stop-after spec` option.

#### Scenario: Generate specification and plan

- **WHEN** the user runs `bossflow run "<goal>" --profile <profile>` with a valid model credential
- **THEN** the command creates `.bossflow/runs/<run-id>/request.md` and `run.json`
- **AND** writes `spec.md`, `spec.json`, `plan.md`, and `plan.json`
- **AND** stops with the run awaiting plan approval
- **AND** reports the run ID, acceptance-criteria count, and approval action

#### Scenario: Generate only a specification

- **WHEN** the user adds `--stop-after spec`
- **THEN** the command generates the specification artifacts without requiring plan generation
- **AND** the run stage remains `spec`

#### Scenario: Reject a missing credential

- **WHEN** the selected model profile has no resolvable credential
- **THEN** the command exits with a non-zero code before invoking the model
- **AND** the error identifies the missing environment variable or the `bossflow auth set` recovery action

## ADDED Requirements

### Requirement: Inspect run status

The system SHALL display a run's current stage, approval state, artifact locations, verification status, review findings, and next required action without exposing secrets.

#### Scenario: Inspect an active run

- **WHEN** the user runs `bossflow status <run-id>`
- **THEN** the command reports the persisted stage and next action
- **AND** lists existing stage artifacts
- **AND** does not expose credential values

#### Scenario: Reject an unknown run

- **WHEN** the supplied run ID does not exist
- **THEN** the command exits with a non-zero code and a clear error

### Requirement: Approve workflow gates

The system SHALL require explicit CLI approval for scope/plan and for external follow-up actions.

#### Scenario: Approve plan

- **WHEN** the user runs `bossflow approve <run-id> --gate plan`
- **THEN** the system records approval of the current specification and plan revisions
- **AND** enables continuation to Build

#### Scenario: Approve external action

- **WHEN** the user approves the review gate with a requested commit or PR action
- **THEN** only the explicitly requested external action becomes eligible
- **AND** approval is recorded before execution

### Requirement: Resume a controlled run

The system SHALL continue a run from its first incomplete gated stage and SHALL refuse to bypass an unsatisfied approval.

#### Scenario: Resume after approval

- **WHEN** the user runs `bossflow resume <run-id>` after plan approval
- **THEN** the system continues through Build, Verify, and Review until the next gate or terminal state

#### Scenario: Refuse an unapproved build

- **WHEN** the user attempts to resume a run whose plan is not approved
- **THEN** the command stops at the plan gate
- **AND** explains the required approval command
