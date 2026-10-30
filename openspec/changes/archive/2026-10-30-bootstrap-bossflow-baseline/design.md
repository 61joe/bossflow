## Context

BossFlow is a TypeScript workspace with a working CLI, workflow core, run store, model profiles, credential handling, and a Codex adapter. The implementation was created before OpenSpec was introduced. The repository therefore needs a one-time baseline that captures current externally observable behavior without changing runtime code.

The current code uses OpenAI Agents SDK JS. OpenAI profiles use native structured output. OpenAI-compatible profiles, including DeepSeek, use prompt-directed JSON with local Zod validation because DeepSeek rejects `response_format.type = "json_schema"`. SDK tracing is disabled by default so non-OpenAI profiles do not require an OpenAI key.

## Goals / Non-Goals

**Goals:**

- Establish repo-local OpenSpec structure and Codex integration.
- Record current CLI, workflow, model, and adapter behavior as testable requirements.
- Preserve a history of the bootstrap change under `openspec/changes/archive/`.
- Create main capability specs that future changes can modify through deltas.
- Ensure the archival process does not move, rewrite, or delete application source code.

**Non-Goals:**

- Implement the remaining plan, build, verify, and review workflow stages.
- Change current runtime behavior, dependencies, model profiles, or credentials.
- Add team authentication, remote stores, an HTTP API, or a Web UI.
- Introduce AI SDK or OS keychain support in this archival change.

## Decisions

### Archive behavior as capability deltas

Create one baseline change with four new capabilities: `cli-interface`, `workflow-runs`, `model-configuration`, and `coding-agent-adapters`. Archive the change so OpenSpec merges these deltas into `openspec/specs/`.

Alternative considered: copy source code into `openspec/`. Rejected because OpenSpec records behavioral contracts and change history, not application source snapshots.

### Separate behavioral specifications by ownership

CLI behavior belongs to `cli-interface`, stage/run persistence to `workflow-runs`, model/provider and credential behavior to `model-configuration`, and Coding Agent integration contracts to `coding-agent-adapters`.

Alternative considered: a single `bossflow` specification. Rejected because future changes would repeatedly rewrite one large, cross-cutting document.

### Keep model configuration separate from secrets

Project configuration stores model identifiers, endpoint metadata, and environment variable names. Secrets come from environment variables or a Git-ignored local credentials file with owner-only permissions.

Alternative considered: store API keys in `config.yaml`. Rejected because project configuration is intended to be versionable and shareable.

### Support DeepSeek through prompt-directed JSON

OpenAI-compatible profiles request plain text and require a JSON object in the prompt, then validate it with Zod. Native JSON Schema structured output remains enabled for OpenAI profiles.

Alternative considered: require every compatible provider to implement OpenAI JSON Schema behavior. Rejected because DeepSeek currently returns HTTP 400 for that response format.

## Risks / Trade-offs

- Prompt-directed JSON is less constrained than native JSON Schema → Validate every response with Zod and keep the response contract explicit in the prompt.
- Provider-specific behavior can drift → Use `bossflow model test` before relying on a new profile and add provider-specific integration tests when available.
- Local credential files are plaintext despite restrictive permissions → Keep them Git-ignored, reject unsafe modes, and plan OS keychain integrations.
- Baseline specs can become stale as code changes → Require future behavioral changes to update OpenSpec deltas in the same change.
- Disabling SDK tracing removes remote trace evidence → Keep local run artifacts and logs as the minimum evidence source; add a configurable tracing provider later.

## Migration Plan

1. Install and initialize OpenSpec for Codex.
2. Create the `bootstrap-bossflow-baseline` change.
3. Write proposal, design, capability deltas, and completed audit tasks.
4. Validate the change and archive it so main specs are populated.
5. Keep application source in place; no runtime rollback is required.

## Open Questions

- Which additional Coding Agent adapters should receive first-class integration?
- When should remote trace export become configurable per model profile?
- Which OS keychain backend should be implemented first?
