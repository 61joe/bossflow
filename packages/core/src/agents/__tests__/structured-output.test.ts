import { z } from 'zod';

// This is a direct unit test of the internal compatibility parser.
import { parseStructuredOutput } from '../structured-output.js';

const ProbeSchema = z
  .object({
    status: z.literal('ok'),
    message: z.string(),
  })
  .strict();

describe('parseStructuredOutput', () => {
  it('parses JSON wrapped in a Markdown code fence', () => {
    const result = parseStructuredOutput(
      '```json\n{"status":"ok","message":"connected"}\n```',
      ProbeSchema,
    );

    expect(result).toEqual({
      status: 'ok',
      message: 'connected',
    });
  });

  it('validates plain text JSON locally', () => {
    expect(() =>
      parseStructuredOutput('{"status":"failed","message":"wrong"}', ProbeSchema),
    ).toThrow();
  });
});
