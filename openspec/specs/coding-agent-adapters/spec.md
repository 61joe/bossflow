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

### Requirement: Resolve Build execution through the selected Coding Agent adapter

The system SHALL obtain the Build-stage Worktree Implementer from the selected Coding Agent adapter
rather than from CLI-owned provider logic.

#### Scenario: Execute Codex through its adapter

- **WHEN** the Codex adapter is selected for an approved Build
- **THEN** its adapter-provided implementer executes in the isolated run worktree
- **AND** a non-zero Coding Agent exit is returned as blocked implementation evidence

#### Scenario: Reject an unavailable adapter before Build

- **WHEN** the selected Coding Agent identifier is not registered
- **THEN** the system rejects the Build request with a clear adapter error
- **AND** no implementation process is started

### Requirement: Keep adapter capabilities behind the adapter boundary

The system SHALL expose adapter-specific execution and installation capabilities through the
selected adapter, and CLI composition SHALL invoke those capabilities without embedding concrete
Codex execution behavior.

#### Scenario: Use the Codex installation capability

- **WHEN** the user requests installation of the Codex integration
- **THEN** CLI composition delegates the operation to the Codex adapter capability
- **AND** conflict and overwrite behavior remains unchanged

#### Scenario: Preserve workflow control

- **WHEN** any supported adapter executes Build
- **THEN** workflow stages, approvals, Worktree selection, path-scope validation, verification,
  Review, and persistence remain owned by BossFlow
- **AND** the adapter does not advance workflow state or authorize external Git actions
