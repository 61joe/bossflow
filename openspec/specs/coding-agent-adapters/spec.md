# coding-agent-adapters Specification

## Purpose

TBD - created by archiving change bootstrap-bossflow-baseline. Update Purpose after archive.

## Requirements

### Requirement: Describe Coding Agent integrations

The system SHALL expose a stable descriptor for each supported Coding Agent adapter.

#### Scenario: Describe the Codex adapter

- **WHEN** the Codex adapter is queried
- **THEN** it reports the identifier `codex`, the display name `Codex Desktop`, and the invocation `$bossflow`

### Requirement: Provide a standalone Codex workflow entrypoint

The system SHALL package a Codex Skill template that starts the BossFlow workflow, checks configuration and credentials, and enforces approval boundaries.

#### Scenario: Install the Codex Skill template

- **WHEN** the adapter package is inspected or distributed
- **THEN** it includes a `bossflow` Skill template under its Codex assets
- **AND** the template instructs the agent to avoid exposing API keys and avoid unapproved external side effects

#### Scenario: Report an unsupported final workflow stage

- **WHEN** the current scaffold has only implemented specification generation
- **THEN** the Skill instructions require the agent to report later stages as incomplete rather than claim them as completed
