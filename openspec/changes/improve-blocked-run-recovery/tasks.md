# Tasks

## 1. Coding Agent Failure Evidence

- [x] 1.1 Add the exported discriminated failure-evidence contract in the owning Core `types.ts` and Zod schema, default legacy implementation results safely, and verify unit tests cover every failure kind plus invalid metadata.
- [x] 1.2 Extend implementation persistence and renderers so `implementation.json` and `implementation.md` expose the normalized outcome, exit code, signal, timeout, duration, and truncation diagnostics without exposing secrets; verify focused persistence and renderer tests.
- [x] 1.3 Update the Codex adapter to classify non-zero exit, timeout, cancellation, signal termination, spawn error, and unknown outcome, and preserve redacted head-tail diagnostics; verify adapter tests cover every branch, empty output, and over-limit diagnostics.
- [x] 1.4 Update the Coding Agent and failure-recovery documentation with the persisted evidence contract and recovery meaning; verify documented fields match generated artifacts.

## 2. Attempt-Aware Run History

- [x] 2.1 Add backward-compatible attempt metadata to the Workflow Run contract with a default for existing `run.json` files; verify schema and Run Store tests read old records and reject invalid attempt values.
- [x] 2.2 Add Run Store artifact archival and current-attempt resolution so a retry preserves prior files and hashes while stage coordinators select only applicable current evidence; verify tests cover first attempts, repeated attempts, missing artifacts, and modified historical artifacts.
- [x] 2.3 Update implementation, verification, Review, and Summary coordinators to use attempt-aware artifact resolution; verify recovery tests do not accept a superseded implementation, verification, Review, or Summary as current evidence.
- [x] 2.4 Document attempt-specific artifact naming and recovery semantics, including which historical files remain immutable; verify the documented examples correspond to Run Store tests.

## 3. Plan Verification Adoption

- [x] 3.1 Extend approval metadata with selected Plan verification IDs and an authoritative command snapshot bound to the current Plan hash; verify contract tests reject duplicate IDs, unknown IDs, invalid commands, and stale Plan hashes.
- [x] 3.2 Implement plan-time command selection that appends only explicitly selected Plan commands to the effective verification set; verify project-profile, approval, and Review authority tests cover selected, unselected, and invalid commands.
- [x] 3.3 Add repeatable `bossflow approve <run-id> --gate plan --verification <id>` CLI support and output the resulting authoritative commands; verify command tests cover no selection, multiple selections, unknown IDs, and atomic rejection.
- [x] 3.4 Document how browser or integration checks move from advisory Plan recommendations to approved verification; verify the examples preserve no-shell, timeout, and Worktree-cwd constraints.

## 4. Controlled Blocked-Run Retry

- [x] 4.1 Add the `bossflow retry <run-id> --from <build|verify>` command, top-level help entry, stable exit behavior, and actionable invalid-state errors; verify CLI tests cover blocked, failed, active, completed, unknown, and unsupported-origin runs.
- [x] 4.2 Implement Build retry with current Plan hash approval, active Worktree ownership, main-worktree identity, approved path-scope, workflow revision, and new-attempt checks; verify Core and integration tests reject stale approvals, foreign Worktrees, changed main-worktree identity, and out-of-scope files.
- [x] 4.3 Implement Verify retry by comparing a fresh Worktree diff hash with the latest completed implementation evidence and rejecting code changes with a Build-retry instruction; verify tests cover unchanged code, changed tracked files, changed untracked files, and mismatched patch hashes.
- [x] 4.4 Allow Plan verification selections during retry without mutating historical approvals, then route retry through Verify and a new Review; verify tests show selected commands execute once and unselected Plan commands remain advisory.
- [x] 4.5 Preserve prior attempt implementation, verification, Review, Summary, findings, and approvals while making only the latest completed attempt authoritative; verify integration tests inspect both historical and current evidence.
- [x] 4.6 Verify retry never creates or carries an external-action approval and cannot reach `completed` without a current Review approval; cover this in CLI and workflow integration tests.
- [x] 4.7 Document the retry decision matrix for Build versus Verify, dirty or changed Worktrees, stale approvals, evidence-only fixes, and code corrections.

## 5. Run Preflight And Node Bootstrap

- [x] 5.1 Move CLI startup behind a dependency-free Node.js engine check and dynamically load workflow modules only after success; verify tests cover supported and unsupported versions and assert no business module is imported on rejection.
- [x] 5.2 Add side-effect-free `bossflow doctor --run` checks for Node.js, configuration, credential source, Git cleanliness, unique package metadata, and writable default Worktree root; verify unit tests cover every pass/fail combination and secret-safe output.
- [x] 5.3 Reuse the preflight result before Plan approval to report whether a Build can safely create or reuse its Worktree, without creating the managed root or final run directory; verify tests compare filesystem snapshots before and after preflight.
- [x] 5.4 Update CLI, project-context, and troubleshooting documentation with the preflight command, local-only scope, model-connectivity distinction, and required remedies; verify each documented failure maps to an implemented diagnostic.

## 6. Integration And Release Readiness

- [x] 6.1 Add an integration fixture for a Coding Agent that writes files and then exits without a numeric code; verify the Run is blocked, the failure kind is recorded, and implementation files are neither treated as success nor discarded.
- [x] 6.2 Add a Tiny Todo-style integration scenario where Plan proposes a browser-oriented check, the user adopts it, the first Review lacks complete evidence, the user retries, and the second Review receives the new authoritative command evidence; verify no external Git action is authorized.
- [x] 6.3 Add Changesets for all three modified workspace packages and document the additive CLI, schema, and recovery behavior without scheduling a release from the feature branch.
- [x] 6.4 Run `pnpm check` and `pnpm exec openspec validate --all --strict`; verify formatting, lint, typecheck, 100% test coverage, build, dependency boundaries, and all OpenSpec artifacts pass.
- [x] 6.5 Run one real Codex conformance scenario through the normal CLI path and inspect its failure or success evidence; verify the report contains no credentials and accurately identifies the first incomplete stage.

## Deferred Backlog

- Follow-up change: add an audited `bossflow run relocate` operation for repositories moved after Run creation.
- Follow-up change: group blocking and non-blocking Review findings in `bossflow status` and show actionable finding IDs.
- Follow-up change: add configuration validation and friendlier repair guidance for malformed verification settings.
- Follow-up investigation: define a secure manual-evidence attestation model if executable browser checks remain unavailable.

## 7. Review Remediation

- [x] 7.1 Replace the generic `blocked/failed → verify` graph edge with a Core-owned Retry Coordinator that enforces every retry precondition before Verify can run; verify direct Core transition attempts are rejected and no commands execute.
- [x] 7.2 Make retry preparation atomic by claiming stage, attempt, project-profile additions, transition, and evidence archival in one Run Store lock; verify concurrent retries produce one winner and interruption leaves a resumable stage.
- [x] 7.3 Restore compile-time compatibility for exported `WorkflowRun`, `ArtifactReference`, and `RunStore` contracts, or explicitly mark and document the change as breaking; verify package typecheck fixtures cover legacy constructors and custom stores.
- [x] 7.4 Reuse the authoritative retry validation in `status`, including Worktree ownership, main-repository fingerprint, and implementation patch equality; verify stale or foreign Worktrees are never presented as valid Verify retries.
- [x] 7.5 Preserve redacted project-inspection failure context in `doctor --run` instead of collapsing all exceptions into generic Git/package diagnostics; verify parsing, permission, and unexpected-error tests report distinct actionable details.
- [x] 7.6 Require both write and execute permissions when checking a directory Worktree root; verify a write-only directory is reported as not-ready.
- [x] 7.7 Run `pnpm check`, `pnpm spec:validate`, and inspect the affected conformance evidence status after remediation.

## Workflow follow-up

- Archive this change only after implementation, full verification, Review, and explicit human acceptance.
- Do not commit, push, merge, or create a pull request without explicit user authorization.
- Do not move the deferred experience improvements into this change without revising the proposal and specs.
