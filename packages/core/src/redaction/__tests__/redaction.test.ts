import { redactError, redactText, redactUnknown } from '../index.js';

describe('secret redaction', () => {
  it('redacts explicit secret values and common token formats', () => {
    const result = redactText('api_key=abc123 Authorization: Bearer ghp_1234567890 secret-value', {
      secrets: ['secret-value'],
    });

    expect(result).not.toContain('abc123');
    expect(result).not.toContain('ghp_1234567890');
    expect(result).not.toContain('secret-value');
    expect(result).toContain('[REDACTED]');
  });

  it('redacts nested artifact content without changing non-sensitive values', () => {
    const result = redactUnknown(
      {
        command: 'API_KEY=secret-value pnpm test',
        exitCode: 1,
        nested: ['token: token-value'],
      },
      { secrets: ['secret-value', 'token-value'] },
    );

    expect(result).toEqual({
      command: 'API_KEY=[REDACTED] pnpm test',
      exitCode: 1,
      nested: ['token: [REDACTED]'],
    });
  });

  it('redacts error messages and causes', () => {
    const error = new Error('Bearer abcdefghijk failed', {
      cause: new Error('password=hunter2'),
    });

    expect(redactError(error)).toEqual({
      name: 'Error',
      message: 'Bearer [REDACTED] failed',
      cause: {
        name: 'Error',
        message: 'password=[REDACTED]',
      },
    });
  });

  it('stops cyclic error cause recursion', () => {
    const error = new Error('root');
    Object.assign(error, { cause: error });

    expect(redactError(error)).toEqual({
      name: 'Error',
      message: 'root',
      cause: {
        name: 'Error',
        message: '[CIRCULAR_CAUSE]',
      },
    });
  });
});
