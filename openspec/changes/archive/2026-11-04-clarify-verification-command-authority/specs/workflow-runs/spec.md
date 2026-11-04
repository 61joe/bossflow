# Spec Delta

## ADDED Requirements

### Requirement: Use the project profile as the verification authority

The system SHALL execute only the verification commands persisted in the confirmed project profile.

#### Scenario: Execute the persisted command set

- **WHEN** a run enters the Verify stage
- **THEN** the system executes the commands stored in `run.json.projectProfile.verificationCommands`
- **AND** recorded results identify those commands as the authoritative executed set
- **AND** technical-plan recommendations do not add execution commands implicitly

#### Scenario: Preserve approved execution boundaries

- **WHEN** the approved technical plan contains verification recommendations not present in the
  project profile
- **THEN** the system does not execute those recommendations automatically
- **AND** the Review records them as advisory rather than as missing required evidence

### Requirement: Block only on authoritative verification failures

The system SHALL treat missing or failed authoritative verification commands as blocking.

#### Scenario: Required verification fails

- **WHEN** an authoritative required command exits non-zero
- **THEN** the run is blocked before Review
- **AND** the failing command ID and bounded evidence are persisted

#### Scenario: Advisory recommendation is not executed

- **WHEN** the plan recommends an additional check that is absent from the project profile
- **THEN** that absence alone does not create a P0 or P1 Review finding
- **AND** the Reviewer may still identify it as an advisory follow-up

### Requirement: Give Review explicit command authority context

The system SHALL give the Reviewer enough context to distinguish executed commands from advisory
recommendations.

#### Scenario: Review generated after verification

- **WHEN** the Review input is assembled
- **THEN** it includes the authoritative command IDs and their real verification evidence
- **AND** it identifies plan recommendations that were not selected for execution
- **AND** the resulting Review can map acceptance criteria without treating advisory commands as
  mandatory evidence
