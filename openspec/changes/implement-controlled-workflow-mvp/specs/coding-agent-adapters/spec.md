## MODIFIED Requirements

### Requirement: Provide a standalone Codex workflow entrypoint

The system SHALL provide an installable Codex Skill that starts the controlled workflow, reads persisted run state, and enforces the same stage and approval boundaries as the CLI.

#### Scenario: Install the Codex Skill

- **WHEN** the user requests Codex integration installation
- **THEN** the adapter installs the `bossflow` Skill into the target project's supported Codex Skill location
- **AND** does not overwrite an unrelated Skill with the same name without confirmation

#### Scenario: Start a workflow from Codex

- **WHEN** the user invokes `$bossflow` with a goal
- **THEN** the Skill resolves repository context, configuration, and credentials
- **AND** creates or resumes a persisted run according to the workflow state

### Requirement: Report an unsupported final workflow stage

The system SHALL report the actual persisted workflow stage, pending approval, failures, and incomplete actions without claiming later stages are complete.

#### Scenario: Report the current workflow stage

- **WHEN** a Codex conversation inspects a run with incomplete Build, Verify, or Review work
- **THEN** the Skill reports the first incomplete stage and required next action
- **AND** does not describe the workflow as completed

#### Scenario: Preserve approval boundaries in Codex

- **WHEN** a run has not recorded plan approval or external-action approval
- **THEN** the Skill does not modify business code or perform the external Git action
