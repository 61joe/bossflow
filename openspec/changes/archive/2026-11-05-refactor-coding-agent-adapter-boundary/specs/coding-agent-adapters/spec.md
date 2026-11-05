## ADDED Requirements

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
