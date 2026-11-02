import { jest } from '@jest/globals';

import { formatError, writeError, writeLine } from '../index.js';

describe('CLI output', () => {
  it('writes stdout and stderr lines', () => {
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

    try {
      writeLine('out');
      writeError('err');
      expect(stdout).toHaveBeenCalledWith('out\n');
      expect(stderr).toHaveBeenCalledWith('err\n');
    } finally {
      stdout.mockRestore();
      stderr.mockRestore();
    }
  });

  it('formats Error and non-Error values', () => {
    expect(formatError(new Error('failure'))).toBe('failure');
    expect(formatError('failure')).toBe('failure');
  });
});
