import type {
  AdapterDescriptor,
  CodingAgentAdapter,
  CodingAgentSkillInstaller,
  WorktreeImplementer,
} from '@bossflow/core';

import {
  CODEX_ADAPTER_DISPLAY_NAME,
  CODEX_ADAPTER_ID,
  CODEX_ADAPTER_INVOCATION,
} from './constant.js';
import { createCodexWorktreeImplementer } from './codex-implementer.js';
import { installCodexSkill } from './skill-installer.js';
import type { CodexSkillInstallOptions, CodexSkillInstallResult } from './types.js';

export class CodexAdapter implements CodingAgentAdapter, CodingAgentSkillInstaller {
  describe(): AdapterDescriptor {
    return {
      id: CODEX_ADAPTER_ID,
      displayName: CODEX_ADAPTER_DISPLAY_NAME,
      invocation: CODEX_ADAPTER_INVOCATION,
    };
  }

  createWorktreeImplementer(): WorktreeImplementer {
    return createCodexWorktreeImplementer();
  }

  installSkill(options: CodexSkillInstallOptions): Promise<CodexSkillInstallResult> {
    return installCodexSkill(options);
  }
}
