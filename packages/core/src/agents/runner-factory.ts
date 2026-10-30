import { Runner } from '@openai/agents';

import type { ModelRuntime } from '../models/index.js';

export function createAgentRunner(runtime?: ModelRuntime): Runner {
  return new Runner({
    tracingDisabled: true,
    ...(runtime === undefined
      ? {}
      : {
          modelProvider: runtime.provider,
          ...(runtime.model === undefined ? {} : { model: runtime.model }),
        }),
  });
}
