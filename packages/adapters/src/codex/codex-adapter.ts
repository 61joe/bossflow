import type { AdapterDescriptor, CodingAgentAdapter } from '@bossflow/core';

import {
  CODEX_ADAPTER_DISPLAY_NAME,
  CODEX_ADAPTER_ID,
  CODEX_ADAPTER_INVOCATION,
} from './constant.js';

export class CodexAdapter implements CodingAgentAdapter {
  describe(): AdapterDescriptor {
    return {
      id: CODEX_ADAPTER_ID,
      displayName: CODEX_ADAPTER_DISPLAY_NAME,
      invocation: CODEX_ADAPTER_INVOCATION,
    };
  }
}
