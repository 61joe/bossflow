# Spec Delta

## MODIFIED Requirements

### Requirement: Discoverable CLI commands

The system SHALL expose its supported commands through the top-level CLI help and SHALL exit successfully when help or version output is requested.

#### Scenario: Display top-level help

- **WHEN** the user executes `bossflow --help`
- **THEN** the process exits with code 0
- **AND** the output lists `doctor`, `init`, `run`, `status`, `approve`, `resume`, `retry`, `adapter`, `model`, and `auth`

#### Scenario: Display version

- **WHEN** the user executes `bossflow --version`
- **THEN** the process exits with code 0
- **AND** the output contains the CLI version

## ADDED Requirements

### Requirement: Validate the runtime before workflow execution

The system SHALL provide a local run-readiness preflight that reports whether the current project
can safely proceed toward Build.

#### Scenario: Report a ready project

- **WHEN** the user runs `bossflow doctor --run` in a supported Node.js environment with a valid
  configuration, a clean Git worktree, unambiguous package metadata, and a writable Worktree root
- **THEN** the command reports each readiness check as passing
- **AND** exits successfully

#### Scenario: Report one or more readiness failures

- **WHEN** the preflight detects an unsupported Node.js version, dirty main worktree, ambiguous
  package metadata, missing configuration, or non-writable Worktree root
- **THEN** the command identifies every failed check and an actionable remedy
- **AND** does not modify the repository or start a Coding Agent

#### Scenario: Preflight does not expose credentials

- **WHEN** the preflight reports model credential availability
- **THEN** it reports only the credential source
- **AND** does not print the credential value

### Requirement: Reject unsupported Node.js before loading workflow modules

The system SHALL check the Node.js engine requirement before loading modules that require the
supported runtime.

#### Scenario: Launch on an unsupported Node.js version

- **WHEN** the CLI starts on a Node.js version below the supported baseline
- **THEN** it prints the installed and required versions
- **AND** exits with a failure instead of exposing an unrelated third-party runtime error

### Requirement: Approve selected plan verification commands

The system SHALL let users explicitly select executable verification commands from the current
technical plan as part of Plan approval.

#### Scenario: Approve a plan with additional checks

- **WHEN** the user supplies one or more supported verification identifiers to
  `bossflow approve <run-id> --gate plan`
- **THEN** the system validates each identifier against the current plan artifact
- **AND** records and displays the additional authoritative commands
- **AND** rejects the complete approval if any identifier is invalid

#### Scenario: Preserve approval without additional checks

- **WHEN** the user approves a plan without verification identifiers
- **THEN** approval behavior remains compatible with the existing project-profile command set

### Requirement: Retry a blocked or failed run from a controlled stage

The system SHALL expose an explicit retry command for blocked or failed runs and SHALL require the
user to select Build or Verify as the retry origin.

#### Scenario: Retry from Build

- **WHEN** the user runs `bossflow retry <run-id> --from build`
- **THEN** the system validates the current Plan approval, Worktree ownership, and path scope
- **AND** starts a new attempt from Build

#### Scenario: Retry from Verify

- **WHEN** the user runs `bossflow retry <run-id> --from verify`
- **THEN** the system validates that implementation evidence still matches the Worktree
- **AND** starts a new attempt from Verify

#### Scenario: Select Plan verification during retry

- **WHEN** the user repeats `--verification <id>` with `bossflow retry` for a blocked or failed run
- **THEN** the command validates every identifier against the current Plan before changing the Run
- **AND** records the selected commands as additional authoritative verification
- **AND** rejects the complete retry if any identifier is invalid

#### Scenario: Reject an unsupported retry state

- **WHEN** the run is not blocked or failed, or the selected retry origin is unavailable
- **THEN** the command exits with an approval or state error
- **AND** the persisted run is not changed

#### Scenario: Explain the next retry action

- **WHEN** a run becomes blocked or failed after this change
- **THEN** status and error output identify whether Build or Verify retry is valid
- **AND** status applies the same Worktree, main-repository, and patch validations as the retry command
- **AND** do not imply that retry authorizes an external Git action
