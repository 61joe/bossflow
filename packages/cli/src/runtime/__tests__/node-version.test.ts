import { jest } from '@jest/globals';

import { evaluateNodeEntrypoint, inspectNodeVersion } from '../index.js';

describe('evaluateNodeEntrypoint', () => {
  it.each(['v24.0.0', 'v24.22.1', 'v25.1.0'])(
    'loads workflow modules for supported version %s',
    async (version) => {
      const load = jest.fn(async () => 'loaded');
      await expect(evaluateNodeEntrypoint(version, load)).resolves.toEqual({
        ok: true,
        value: 'loaded',
      });
      expect(inspectNodeVersion(version).supported).toBe(true);
      expect(load).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['v20.14.0', 'v23.9.0', 'invalid'])(
    'rejects unsupported version %s before loading modules',
    async (version) => {
      const load = jest.fn(async () => 'should not load');
      const result = await evaluateNodeEntrypoint(version, load);
      expect(result).toMatchObject({
        ok: false,
        message: expect.stringContaining('requires Node.js >=24'),
      });
      expect(result.ok ? result.value : result.message).toContain(version);
      expect(inspectNodeVersion(version).supported).toBe(false);
      expect(load).not.toHaveBeenCalled();
    },
  );
});
