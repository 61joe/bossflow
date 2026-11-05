import { RetryError } from '@bossflow/core';

import { CLI_EXIT_CODES } from '../constant.js';
import { mapRetryError } from '../workflow-error-mapper.js';

describe('workflow error mapper', () => {
  it.each([
    ['approval-required', CLI_EXIT_CODES.APPROVAL_REQUIRED],
    ['blocked', CLI_EXIT_CODES.BLOCKED],
    ['missing-artifact', CLI_EXIT_CODES.MISSING_ARTIFACT],
    ['failed', CLI_EXIT_CODES.FAILED],
  ] as const)('maps %s retry errors', (code, exitCode) => {
    expect(mapRetryError(new RetryError('retry failed', code))).toMatchObject({
      exitCode,
      message: 'retry failed',
    });
  });

  it('passes unrelated errors through unchanged', () => {
    const error = new Error('unrelated');
    expect(mapRetryError(error)).toBe(error);
  });
});
