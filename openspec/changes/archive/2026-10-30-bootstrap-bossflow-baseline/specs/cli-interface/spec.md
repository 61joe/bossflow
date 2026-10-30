## ADDED Requirements

### Requirement: Discoverable CLI commands

The system SHALL expose its supported commands through the top-level CLI help and SHALL exit successfully when help or version output is requested.

#### Scenario: Display top-level help

- **WHEN** the user executes `bossflow --help`
- **THEN** the process exits with code 0
- **AND** the output lists `doctor`, `init`, `run`, `model`, and `auth`

#### Scenario: Display version

- **WHEN** the user executes `bossflow --version`
- **THEN** the process exits with code 0
- **AND** the output contains the CLI version

### Requirement: Initialize project configuration

The system SHALL create `.bossflow/config.yaml` when project configuration does not exist and SHALL preserve an existing configuration file.

#### Scenario: Initialize an unconfigured project

- **WHEN** the user runs `bossflow init` without an existing configuration
- **THEN** `.bossflow/config.yaml` is created with the current schema version, workflow defaults, and an OpenAI model profile

#### Scenario: Preserve an existing configuration

- **WHEN** the user runs `bossflow init` after configuration already exists
- **THEN** the command reports that configuration already exists
- **AND** the existing configuration is not overwritten

### Requirement: Diagnose local configuration

The system SHALL report the Node.js version, configuration presence, selected model profile, and credential source without revealing an API key.

#### Scenario: Diagnose a configured project

- **WHEN** the user runs `bossflow doctor` in a project with valid configuration
- **THEN** the output includes the selected model profile and whether its credential source is environment, local file, or missing
- **AND** the output does not contain the credential value

#### Scenario: Diagnose an unconfigured project

- **WHEN** the user runs `bossflow doctor` without `.bossflow/config.yaml`
- **THEN** the command exits successfully
- **AND** the output reports that configuration is missing

### Requirement: Generate a specification run

The system SHALL create a persisted run, invoke the selected model profile, validate the structured specification, and write readable and JSON specification artifacts.

#### Scenario: Generate a specification

- **WHEN** the user runs `bossflow run "<goal>" --profile <profile>` with a valid model credential
- **THEN** the command creates `.bossflow/runs/<run-id>/request.md` and `run.json`
- **AND** writes `spec.md` and `spec.json`
- **AND** reports the run ID and acceptance-criteria count

#### Scenario: Reject a missing credential

- **WHEN** the selected model profile has no resolvable credential
- **THEN** the command exits with a non-zero code before invoking the model
- **AND** the error identifies the missing environment variable or the `bossflow auth set` recovery action
