# coding-agent-conformance Specification

## Purpose

Defines how BossFlow proves that a supported Coding Agent integration can complete real development
tasks through the same workflow and safety boundaries used by product users.

## Requirements

### Requirement: Execute conformance with the real Coding Agent

The system SHALL validate the supported Coding Agent integration with the real Coding Agent rather
than a fake implementation.

#### Scenario: Run a real conformance task

- **WHEN** a conformance task is started for the Codex integration
- **THEN** BossFlow uses a disposable Git repository and the normal Build, Verify, Review, and
  approval workflow
- **AND** the real Codex Coding Agent performs implementation in the isolated worktree
- **AND** no fake Coding Agent substitutes for Build

#### Scenario: Preserve product safety boundaries

- **WHEN** the real Coding Agent executes a conformance task
- **THEN** implementation remains inside the run worktree
- **AND** external Git actions require the same explicit authorization used by a normal run
- **AND** artifact hashes and approval state are not bypassed

### Requirement: Cover representative conformance scenarios

A conformance campaign SHALL cover at least three representative development tasks across at least
two project profiles.

#### Scenario: Complete the minimum conformance campaign

- **WHEN** maintainers declare Coding Agent conformance complete
- **THEN** at least three task records are available
- **AND** the records cover at least two project profiles
- **AND** each task reports its final workflow stage and outcome without claiming incomplete work
  as completed

### Requirement: Record conformance evidence

The system SHALL record reviewable evidence for every conformance task.

#### Scenario: Inspect a successful conformance record

- **WHEN** a conformance task reaches a final outcome
- **THEN** its record identifies the adapter, project profile, run ID, actual stage, changed paths,
  verification command results, Review findings, user interventions, and authorized external
  actions
- **AND** evidence contains no API keys or credential values

#### Scenario: Preserve a failed conformance record

- **WHEN** a conformance task fails or blocks
- **THEN** the record identifies the first incomplete stage and actionable failure evidence
- **AND** the failure is not converted into a successful conformance result
