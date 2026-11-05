# coding-agent-adapters Specification

## Purpose

Defines the stable boundaries through which BossFlow discovers Coding Agent integrations, installs
their entrypoints, and preserves workflow stage and approval controls.

## Requirements

### Requirement: Describe Coding Agent integrations

The system SHALL expose a stable descriptor for each supported Coding Agent adapter.

#### Scenario: Describe the Codex adapter

- **WHEN** the Codex adapter is queried
- **THEN** it reports the identifier `codex`, the display name `Codex Desktop`, and the invocation `$bossflow`

### Requirement: Provide a standalone Codex workflow entrypoint

The system SHALL provide an installable Codex Skill that starts the controlled workflow, reads persisted run state, and enforces the same stage and approval boundaries as the CLI.

#### Scenario: Install the Codex Skill template

- **WHEN** the user requests Codex integration installation
- **THEN** the adapter installs the `bossflow` Skill into the target project's supported Codex Skill location
- **AND** does not overwrite an unrelated Skill with the same name without confirmation

#### Scenario: Start a workflow from Codex

- **WHEN** the user invokes `$bossflow` with a goal
- **THEN** the Skill resolves repository context, configuration, and credentials
- **AND** creates or resumes a persisted run according to the workflow state

#### Scenario: Report an unsupported final workflow stage

- **WHEN** a Codex conversation inspects a run with incomplete Build, Verify, or Review work
- **THEN** the Skill reports the first incomplete stage and required next action
- **AND** does not describe the workflow as completed

#### Scenario: Preserve approval boundaries in Codex

- **WHEN** a run has not recorded plan approval or external-action approval
- **THEN** the Skill does not modify business code or perform the external Git action
