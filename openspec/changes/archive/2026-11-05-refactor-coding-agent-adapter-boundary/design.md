# Design

## Context

See `proposal.md - Why` and `specs/coding-agent-adapters/spec.md`.

`WorkflowService` already accepts a `WorktreeImplementer`, so the Build workflow does not need a new
execution abstraction. The missing boundary is above that interface: CLI currently creates the
Codex implementer directly and owns its prompt, process invocation, limits, failure normalization,
tests, and `execa` dependency.

## Goals / Non-Goals

**Goals:**

- Make the selected adapter the single source of Build implementation behavior.
- Keep CLI as the composition root without embedding Codex execution details.
- Move Codex-specific dependencies, constants, prompt construction, and tests into the adapter.
- Preserve existing workflow, Worktree, verification, Review, and persistence behavior.
- Provide a clean extension point for future Coding Agent adapters.

**Non-Goals:**

- Adding a second Coding Agent in this change.
- Adding user-facing Coding Agent configuration or model routing.
- Moving the CLI registry into Core or Adapters.
- Changing external Git authorization, workflow stages, or artifact formats.
- Redesigning Skill installation for providers without a Skill capability.

## Decisions

### Extend the adapter contract with Worktree Implementer creation

The `CodingAgentAdapter` contract will expose both descriptor information and creation of the
`WorktreeImplementer` consumed by Build. The interface will use a type-only dependency on Core's
existing implementation contract, avoiding a runtime cycle.

Alternative considered: keep a factory in CLI and import concrete Codex code. Rejected because it
keeps provider execution behavior outside the adapter boundary.

### Keep the registry in CLI as a composition root

`CodingAgentRegistry` will register adapter objects and resolve descriptor, implementer, and
installation capabilities through those objects. It remains in CLI because selecting concrete
adapters is application composition, not reusable workflow behavior.

Alternative considered: move the registry to Core. Rejected because it would make Core aware of
concrete adapter composition and blur the dependency direction.

### Model Skill installation as an optional adapter capability

Skill installation is not guaranteed for every Coding Agent. CLI will check whether the selected
adapter supports installation before invoking it. This preserves the current Codex command while
avoiding a generic contract that forces unrelated capabilities onto future adapters.

Alternative considered: add `installSkill()` directly to every adapter. Rejected because Skill
installation semantics vary by provider and are not required for Build.

### Move execution ownership and dependencies together

The Codex implementer, prompt text, timeout, output limit, process invocation, cancellation, and
failure redaction will move into `packages/adapters/src/codex`. The `execa` dependency moves from
CLI to Adapters in the same change so package ownership remains accurate.

Alternative considered: leave `execa` in CLI and import it from Adapters through hoisting. Rejected
because it relies on workspace dependency hoisting and makes the package manifest incorrect.

## Risks / Trade-offs

- Internal public API movement can break consumers of `@bossflow/cli` → mark the change in a
  Changeset and update exports/documentation in the same PR.
- Codex error semantics may drift during migration → move existing tests and assert the unchanged
  prompt, timeout, cancellation, `stdin`, sandbox, and redaction behavior.
- Adapter/Core circular dependencies could emerge → keep the Core import type-only and verify the
  production build.
- Real Codex behavior can regress even when unit tests pass → rerun one conformance scenario through
  the normal CLI path after migration.
- Registry API changes can affect custom registrations → update tests and document that adapters,
  rather than bare factories, are the supported composition unit.

## Migration Plan

1. Extend the Core adapter contract and exports.
2. Move Codex implementer behavior and tests into the adapter package.
3. Make `CodexAdapter` provide the implementer and optional installation capability.
4. Update CLI registry and composition to use adapter objects.
5. Remove CLI-owned Codex execution files, exports, and the direct `execa` dependency.
6. Update package manifests, lockfile, Changesets, OpenSpec, and architecture documentation.
7. Run `pnpm check` and `pnpm spec:validate`, then rerun a real Codex conformance scenario.

Rollback is limited to reverting this refactor; persisted runs and artifact formats are unchanged.
