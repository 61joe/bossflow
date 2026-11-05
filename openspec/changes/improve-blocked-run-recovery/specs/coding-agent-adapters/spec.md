# Spec Delta

## ADDED Requirements

### Requirement: Normalize Coding Agent process failures

The system SHALL persist a stable failure kind and available process metadata whenever a Coding
Agent does not complete successfully.

#### Scenario: Coding Agent exits non-zero

- **WHEN** the Coding Agent process completes with a non-zero exit code
- **THEN** the implementation evidence records a non-zero-exit failure with the exit code
- **AND** the run remains blocked

#### Scenario: Coding Agent is terminated

- **WHEN** the Coding Agent process times out, receives a signal, or observes cancellation
- **THEN** the implementation evidence distinguishes timeout, signal termination, and cancellation
- **AND** records the available signal and duration
- **AND** the run remains blocked

#### Scenario: Coding Agent cannot start

- **WHEN** the Coding Agent process cannot be spawned
- **THEN** the implementation evidence records a spawn failure and a bounded diagnostic
- **AND** the run remains blocked

#### Scenario: Process outcome is unavailable

- **WHEN** the Coding Agent returns without a numeric exit code and no more specific outcome is
  available
- **THEN** the implementation evidence records an unknown-outcome failure
- **AND** the failure is not treated as success

### Requirement: Preserve useful Coding Agent diagnostics

The system SHALL retain bounded diagnostic head and tail content for failed Coding Agent processes
and SHALL redact detected secrets before persistence.

#### Scenario: Failure output exceeds the evidence limit

- **WHEN** Coding Agent diagnostics exceed the configured evidence limit
- **THEN** the persisted evidence contains both the beginning and end of the available output
- **AND** identifies that the middle was omitted

#### Scenario: Failure output contains a credential

- **WHEN** Coding Agent stderr or stdout contains a value detected as a secret
- **THEN** the persisted diagnostic replaces that value with a redaction marker
