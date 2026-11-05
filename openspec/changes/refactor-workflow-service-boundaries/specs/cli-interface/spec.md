# Spec Delta

## ADDED Requirements

### Requirement: Preserve workflow command behavior across service decomposition

The system SHALL preserve the public behavior of workflow CLI operations when internal workflow
services are decomposed.

#### Scenario: Run workflow commands after decomposition

- **WHEN** a user runs `run`, `resume`, `retry`, `approve`, or `status`
- **THEN** the command preserves its existing stage outcomes, generated artifacts, approval
  semantics, and external-action boundaries

#### Scenario: Report workflow failures after decomposition

- **WHEN** a workflow operation fails with a missing run, missing artifact, stale approval, blocked
  execution, failed verification, or blocked Review
- **THEN** the CLI preserves the documented exit-code category and actionable recovery guidance
