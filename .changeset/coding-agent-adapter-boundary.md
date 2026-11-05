---
'@bossflow/adapters': minor
'@bossflow/cli': minor
'@bossflow/core': minor
---

Move Codex Build execution, prompt construction, process limits, failure normalization, and tests
into the adapter package. Adapters now provide Worktree Implementers and optional Skill-installation
capabilities, while CLI composition resolves adapters without owning concrete Codex execution.
