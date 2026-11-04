# Tasks

## 1. Verification Authority Contract

- [x] 1.1 Add backward-compatible types for authoritative commands, executed command evidence,
      advisory plan commands, and missing required evidence; verify type tests and schema tests accept
      existing fixtures.
- [x] 1.2 Implement a derivation helper that compares plan recommendations with executed project
      profile commands by ID, command, arguments, and cwd; verify unit tests cover exact matches,
      changed commands, extra advisory checks, and missing authoritative evidence.

## 2. Verification And Review Behavior

- [x] 2.1 Populate the new verification context from the persisted project profile, approved plan,
      and verification report; verify an integration test exposes the expected context to the Reviewer.
- [x] 2.2 Update Reviewer instructions to block on failed or missing authoritative commands and treat
      only unmatched plan checks as advisory; verify prompt/agent tests cover both outcomes.
- [x] 2.3 Ensure a failing authoritative command still blocks before Review while a non-executed
      advisory recommendation alone cannot create a P0/P1 blocker; verify integration tests for both
      paths.
- [x] 2.4 Verify existing run, plan, Review, resume, and recovery fixtures remain readable and
      resumable without artifact migration.

## 3. Documentation And Regression Coverage

- [x] 3.1 Update verification/Review documentation and remove the resolved decision from `TODO.md`;
      verify documented behavior matches the OpenSpec scenarios.
- [x] 3.2 Add a real-model smoke scenario where the plan proposes an extra check and the workflow
      completes without an advisory command being represented as required evidence; verify the smoke
      result reports the actual four authoritative commands and no false P1.

## 4. Final Verification

- [x] 4.1 Run `pnpm check` and `pnpm spec:validate`, and verify all checks pass.

## Workflow follow-up

- Archive the change after review and the real-model smoke are complete.
