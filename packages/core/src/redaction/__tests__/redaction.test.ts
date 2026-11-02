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

  it('supports custom replacement text and ignores empty secrets', () => {
    expect(
      redactText('secret-value remains', {
        secrets: ['', 'secret-value'],
        replacement: '<hidden>',
      }),
    ).toBe('<hidden> remains');
    expect(redactText('Bearer abcdefghijk')).toBe('Bearer [REDACTED]');
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

  it('redacts non-error throw values and depth-limited cause chains', () => {
    expect(redactError('Bearer abcdefghijk')).toEqual({
      name: 'Error',
      message: 'Bearer [REDACTED]',
    });

    const root = new Error('root');
    let current = root;
    for (let index = 0; index < 14; index += 1) {
      const next = new Error(`cause-${index}`);
      Object.assign(current, { cause: next });
      current = next;
    }

    let redacted = redactError(root);
    for (let index = 0; index < 14 && redacted.cause !== undefined; index += 1) {
      redacted = redacted.cause;
    }
    expect(redacted.message).toBe('[MAX_CAUSE_DEPTH]');
    expect(redactError({ message: 'password=hunter2' })).toEqual({
      name: 'Error',
      message: 'password=[REDACTED]',
    });
    expect(redactError({ message: 123 })).toEqual({
      name: 'Error',
      message: '[object Object]',
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

  it('preserves primitives and depth-limits nested artifacts', () => {
    expect(redactUnknown(42)).toBe(42);

    let nested: unknown = 'leaf';
    for (let index = 0; index < 14; index += 1) {
      nested = { child: nested };
    }

    expect(JSON.stringify(redactUnknown(nested))).toContain('[MAX_DEPTH]');
  });
});
