# Tasks

## 1. Conformance Harness

- [x] 1.1 Define a sanitized conformance report schema and types, and verify unit tests cover
      successful, blocked, and failed report shapes.
- [x] 1.2 Add a dedicated manual `conformance:codex` command that builds first, validates Codex
      availability/authentication without printing credentials, and creates a disposable repository;
      verify `--help` and a preflight failure return actionable exit codes.
- [x] 1.3 Add fixture profiles for the required project coverage and verify fixture tests show the
      expected Git, package-manager, language, and verification-command profiles.
- [x] 1.4 Implement explicit cleanup and `--keep-on-failure` behavior and verify both success cleanup
      and retained failure evidence with automated filesystem tests.

## 2. Real Codex Workflow Execution

- [x] 2.1 Run the normal BossFlow run, plan approval, Build, Verify, Review, and optional review
      approval flow with the real Codex Coding Agent, and verify no fake implementer is selected.
- [x] 2.2 Enforce worktree-only writes, path-scope validation, artifact integrity, and
      external-action authorization in the conformance command; verify existing safety tests still pass
      and a synthetic out-of-scope mutation is rejected.
- [x] 2.3 Add a Codex Desktop `$bossflow` manual conformance checklist covering Skill installation,
      stage reporting, approval prompts, and resume behavior; verify the checklist can be completed
      without reading the full chat transcript.

## 3. Evidence And Reporting

- [x] 3.1 Collect the adapter ID, project profile, run ID, actual stage, changed paths, verification
      results, Review findings, user interventions, and authorized external actions from run artifacts;
      verify the generated report matches the source `run.json` and artifact hashes.
- [x] 3.2 Apply secret redaction and exclude environment dumps, credentials, raw prompts, and
      unnecessary repository content; verify tests fail if a configured secret appears in the report.
- [x] 3.3 Document how to run, inspect, sanitize, retain, and clean conformance evidence in
      `docs/TEST_STRATEGY.md`; verify the documented command matches `package.json`.

## 4. MVP Conformance Campaign

- [x] 4.1 Execute and record at least three representative tasks across at least two project
      profiles; verify every report has a final outcome and truthful first-incomplete-stage reporting.
- [x] 4.2 Summarize the campaign in sanitized committed evidence and update PRD acceptance status;
      verify each claimed MVP criterion links to a conformance or automated test record.
- [x] 4.3 Run `pnpm check` and `pnpm spec:validate`, and verify all checks pass.

## Workflow follow-up

- Archive the change after review and acceptance evidence are complete.
- Start non-Codex adapter conformance only after the Codex campaign is stable.
