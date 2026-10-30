## Why

BossFlow already has a working TypeScript CLI, run store, multi-model configuration, credential handling, and a Codex adapter, but these behaviors are not yet represented in OpenSpec. Establish a baseline now so future changes have an explicit behavioral contract and archived implementation history.

## What Changes

- Add baseline specifications for the implemented CLI, workflow/run persistence, model configuration, and Coding Agent adapter boundary.
- Record the current OpenAI and OpenAI-compatible model behavior, including DeepSeek compatibility.
- Document the existing artifact, credential, and approval constraints as observable requirements.
- Make no runtime behavior changes as part of this archival change.

## Capabilities

### New Capabilities

- `cli-interface`: Project initialization, environment diagnostics, and specification-generation commands.
- `workflow-runs`: Run lifecycle, stage transitions, and persisted workflow artifacts.
- `model-configuration`: Model profiles, provider selection, structured output compatibility, and credential resolution.
- `coding-agent-adapters`: Stable contracts for attaching BossFlow to Codex and future Coding Agents.

### Modified Capabilities

None.

## Impact

- Code: `packages/core`, `packages/cli`, and `packages/adapters`.
- Documentation: PRD, technical stack, TypeScript style guide, and model configuration guide.
- Dependencies: OpenAI Agents SDK JS, Zod, Commander, YAML, and Jest.
- Runtime: no code or data migration is introduced by this archival change.
