# Codex Conformance Evidence

## 2026-11-04 Campaign

- Adapter: `codex`
- Real Coding Agent: Codex CLI `0.162.0`
- Reasoning model: `deepseek-flash`
- Project profiles: `single-package-javascript`, `multi-package-javascript`
- Tasks: 3
- Outcomes: 3 completed
- Authorized external actions: none

Reports:

- [single-js-export](./evidence/single-js-export-01e32c7f-a832-4893-a02a-a98f7db8d302.json)
- [single-js-function](./evidence/single-js-function-c53b820e-b061-42e1-8c9c-9c6f94b7ac7f.json)
- [multi-package-js-export](./evidence/multi-package-js-export-9cd0e99f-eb2e-4e0e-862b-6fc558f49c80.json)

All three reports:

- reached `stage=completed`;
- changed only the scenario's approved path;
- passed lint, typecheck, test, and build;
- recorded zero Review findings;
- recorded no external-action authorization;
- contain artifact SHA-256 references without raw prompts, credentials, environment dumps, or
  command output.

The campaign also identified and fixed a real adapter defect: `codex exec` waited for open stdin when
launched through `execa`. The Codex implementer now sets `stdin: 'ignore'`.

## Limitations

- This campaign validates the real Codex CLI Build path, not real Codex Desktop `$bossflow`
  interactions.
- The campaign does not establish universal repository coverage or a task success-rate guarantee.
- The manual Codex Desktop checklist remains in
  [BossFlow 测试策略](../TEST_STRATEGY.md).
