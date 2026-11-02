import { jest } from '@jest/globals';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { main, setAgentOutput } from './cli-test-runtime.js';

const specification = {
  title: 'Export',
  problem: 'No export',
  scope: ['Add export'],
  nonGoals: [],
  acceptanceCriteria: ['File downloads'],
  constraints: [],
};

describe('CLI run command', () => {
  it('runs the default profile and an explicit profile/model override', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-main-run-'));
    const originalCwd = process.cwd();
    const originalOpenAiKey = process.env.OPENAI_API_KEY;
    const originalLocalKey = process.env.LOCAL_KEY;
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    try {
      process.chdir(projectRoot);
      process.env.OPENAI_API_KEY = 'openai-key';
      await main(['node', 'bossflow', 'init']);
      setAgentOutput(specification);
      await main(['node', 'bossflow', 'run', 'Add export']);

      await main([
        'node',
        'bossflow',
        'model',
        'add',
        'local',
        '--kind',
        'openai-compatible',
        '--model',
        'compatible-model',
        '--base-url',
        'https://models.example.com',
        '--api-key-env',
        'LOCAL_KEY',
      ]);
      process.env.LOCAL_KEY = 'local-key';
      await main([
        'node',
        'bossflow',
        'run',
        'Add export with override',
        '--profile',
        'local',
        '--model',
        'override-model',
      ]);

      const runIds = await readdir(path.join(projectRoot, '.bossflow', 'runs'));
      const actualRunIds = runIds.filter((runId) => !runId.startsWith('.'));
      expect(actualRunIds).toHaveLength(2);
      const runs = await Promise.all(
        actualRunIds.map(async (runId) =>
          JSON.parse(
            await readFile(path.join(projectRoot, '.bossflow', 'runs', runId, 'run.json'), 'utf8'),
          ),
        ),
      );
      const run = runs.find((entry) => entry.goal === 'Add export with override');
      expect(run).toMatchObject({ modelProfile: 'local', model: 'override-model' });
      expect(stdout).toHaveBeenCalledWith('Specification created with 1 acceptance criteria.\n');
    } finally {
      process.chdir(originalCwd);
      if (originalLocalKey === undefined) {
        delete process.env.LOCAL_KEY;
      } else {
        process.env.LOCAL_KEY = originalLocalKey;
      }
      if (originalOpenAiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalOpenAiKey;
      }
      stdout.mockRestore();
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
