# Spec Delta

## ADDED Requirements

### Requirement: Adopt plan verification commands explicitly

The system SHALL allow a user to adopt selected verification commands from the current technical
plan when approving that plan, and SHALL reject commands that are missing from the plan.

#### Scenario: Adopt a plan-discovered browser check

- **WHEN** the current technical plan contains an additional executable verification command and
  the user explicitly selects it during Plan approval
- **THEN** the command is persisted in the run's authoritative project profile
- **AND** the Plan approval record identifies the adopted command
- **AND** Verify executes that command in addition to the originally confirmed commands

#### Scenario: Do not adopt by default

- **WHEN** the user approves a plan without selecting additional verification commands
- **THEN** only the previously confirmed project-profile commands remain authoritative
- **AND** plan recommendations remain advisory

#### Scenario: Reject an unapproved verification identifier

- **WHEN** the user requests adoption of a verification command that is absent from the current
  plan artifact
- **THEN** the system rejects the request before Build
- **AND** the run records no new approval or verification authority

#### Scenario: Reject stale verification adoption

- **WHEN** the plan artifact hash changes after verification commands were adopted
- **THEN** the prior adoption no longer authorizes Verify
- **AND** the user must approve the current plan revision again

### Requirement: Retry blocked or failed runs explicitly

The system SHALL allow a blocked or failed run to enter a new workflow revision through an explicit
retry action while preserving all plan, path-scope, verification, and Review gates.

#### Scenario: Prepare retry atomically

- **WHEN** two retry requests race for the same blocked or failed Run
- **THEN** only one request can claim the next attempt
- **AND** the losing request changes neither stage nor evidence
- **AND** an interruption after the claim leaves a resumable Build or Verify stage with archived prior evidence

#### Scenario: Reject generic Verify transition from a terminal stage

- **WHEN** a caller attempts to move a blocked or failed Run directly to Verify without the
  Core-owned retry operation
- **THEN** the transition is rejected
- **AND** no verification command executes

#### Scenario: Retry from Build after a code correction

- **WHEN** the user explicitly retries a blocked or failed run from Build
- **THEN** the system creates a new workflow revision
- **AND** reuses only a currently approved Plan for the same Run
- **AND** executes the Coding Agent in the run's isolated Worktree
- **AND** rejects changed paths outside the approved scope

#### Scenario: Retry from Verify after an accepted implementation

- **WHEN** the user explicitly retries from Verify and the Worktree still matches the latest
  completed implementation evidence
- **THEN** the system creates a new workflow revision
- **AND** executes the current authoritative verification command set
- **AND** sends the resulting evidence through a new Review

#### Scenario: Reject Verify retry after code changes

- **WHEN** the Worktree no longer matches the latest completed implementation evidence
- **THEN** the system rejects a retry from Verify
- **AND** directs the user to retry from Build

#### Scenario: Select Plan verification during retry

- **WHEN** the user selects verification IDs from the current Plan while retrying a blocked or
  failed run
- **THEN** the system binds the selection to the current Plan hash and new workflow revision
- **AND** records the selection without mutating the historical Plan approval
- **AND** uses only the selected commands as additional authoritative verification

#### Scenario: Retry does not authorize external actions

- **WHEN** a blocked or failed run is retried
- **THEN** no commit, push, merge, or pull request becomes authorized
- **AND** the resulting Review still requires explicit Review approval for any external action

### Requirement: Preserve prior retry evidence

The system SHALL retain reviewable evidence from every failed, blocked, or completed attempt while
making the latest completed attempt authoritative for subsequent gates.

#### Scenario: Record a repeated implementation attempt

- **WHEN** a retry executes Build again
- **THEN** the prior implementation evidence remains available
- **AND** the new implementation evidence identifies its attempt and workflow revision
- **AND** Review uses the latest completed attempt

#### Scenario: Preserve prior Review findings

- **WHEN** a retry produces a new Review
- **THEN** the earlier Review and Summary remain available for audit
- **AND** approval of the current Review cannot approve a superseded Review artifact
