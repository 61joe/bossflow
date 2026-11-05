import type { CodingAgentAdapter } from '@bossflow/core';

import { executeAdapterInstall } from '../command-handler.js';
import { CLI_EXIT_CODES } from '../constant.js';
import { CodingAgentRegistry } from '../index.js';

describe('adapter install command', () => {
  it('rejects a registered adapter without Skill installation capability', async () => {
    const adapter: CodingAgentAdapter = {
      describe: () => ({
        id: 'custom',
        displayName: 'Custom Agent',
        invocation: '$custom',
      }),
      createWorktreeImplementer: () => async () => ({
        schemaVersion: 1,
        status: 'completed',
        summary: 'Implemented.',
        changedPaths: [],
        testChanges: [],
        notes: [],
      }),
    };
    const registry = new CodingAgentRegistry().register(adapter);

    await expect(
      executeAdapterInstall('custom', { project: '/project' }, registry),
    ).rejects.toMatchObject({
      message: 'Coding Agent adapter "custom" does not support Skill installation.',
      exitCode: CLI_EXIT_CODES.USAGE_ERROR,
    });
  });
});
