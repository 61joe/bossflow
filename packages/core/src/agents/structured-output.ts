import type { z } from 'zod';

import { JSON_CODE_FENCE_PATTERN } from './constant.js';

export function parseStructuredOutput<T>(output: unknown, schema: z.ZodType<T>): T {
  if (typeof output !== 'string') {
    return schema.parse(output);
  }

  const fenceMatch = JSON_CODE_FENCE_PATTERN.exec(output.trim());
  const jsonText = fenceMatch?.[1] ?? output;
  return schema.parse(JSON.parse(jsonText));
}
