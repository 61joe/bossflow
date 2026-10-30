import { Agent } from '@openai/agents';
import { z } from 'zod';

import {
  MODEL_PROBE_INSTRUCTIONS,
  MODEL_PROBE_JSON_INSTRUCTIONS,
  MODEL_PROBE_REQUEST,
} from './constant.js';
import type { ModelRuntime } from '../models/index.js';
import { createAgentRunner } from './runner-factory.js';
import { parseStructuredOutput } from './structured-output.js';
import type { ModelProbeResult } from './types.js';

const MODEL_PROBE_NAME = 'BossFlowModelProbe';

const ModelProbeSchema = z
  .object({
    status: z.literal('ok'),
    message: z.string().min(1),
  })
  .strict();

export async function probeModelRuntime(runtime: ModelRuntime): Promise<ModelProbeResult> {
  const agent =
    runtime.structuredOutputMode === 'prompt-json'
      ? new Agent({
          name: MODEL_PROBE_NAME,
          instructions: MODEL_PROBE_JSON_INSTRUCTIONS,
        })
      : new Agent({
          name: MODEL_PROBE_NAME,
          instructions: MODEL_PROBE_INSTRUCTIONS,
          outputType: ModelProbeSchema,
        });
  const runner = createAgentRunner(runtime);
  const result = await runner.run(agent, MODEL_PROBE_REQUEST);
  return parseStructuredOutput(result.finalOutput, ModelProbeSchema);
}
