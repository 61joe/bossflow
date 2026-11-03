/* eslint-disable max-lines-per-function -- CLI scenarios share setup and cleanup for the same temporary project. */
import { jest } from '@jest/globals';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { main, setAgentOutput, setAgentOutputs } from './cli-test-runtime.js';

const specification = {
  title: 'Export',
  problem: 'No export',
  scope: ['Add export'],
  nonGoals: [],
  acceptanceCriteria: ['File downloads'],
  constraints: [],
};
const plan = {
  schemaVersion: 1,
  summary: 'Add export support.',
  affectedPaths: ['src'],
  tasks: [
    {
      id: 'task-1',
      title: 'Implement export',
      description: 'Add the export feature.',
      dependencies: [],
      affectedPaths: ['src'],
      acceptanceCriteria: ['File downloads'],
    },
  ],
  interfaceChanges: [],
  risks: [],
  verificationCommands: [
    {
      id: 'test',
      label: 'Test',
      command: 'pnpm',
      args: ['test'],
      required: true,
      timeoutMs: 1_000,
    },
  ],
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
      await main([
        'node',
        'bossflow',
        'run',
        'Add export',
        '--confirm-project',
        '--stop-after',
        'spec',
      ]);

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
        '--confirm-project',
        '--profile',
        'local',
        '--model',
        'override-model',
        '--stop-after',
        'spec',
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
      expect(run).toMatchObject({
        modelProfile: 'local',
        model: 'override-model',
        projectProfile: {
          requiresConfirmation: true,
          confirmedByUser: true,
        },
      });
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

  it('refuses ambiguous project verification without explicit confirmation', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-main-run-confirm-'));
    const originalCwd = process.cwd();
    const originalOpenAiKey = process.env.OPENAI_API_KEY;
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    try {
      process.chdir(projectRoot);
      process.env.OPENAI_API_KEY = 'openai-key';
      await main(['node', 'bossflow', 'init']);

      await expect(main(['node', 'bossflow', 'run', 'Add export'])).rejects.toThrow(
        'Project verification requires confirmation',
      );
      await expect(readdir(path.join(projectRoot, '.bossflow', 'runs'))).rejects.toThrow();
    } finally {
      process.chdir(originalCwd);
      if (originalOpenAiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalOpenAiKey;
      }
      stdout.mockRestore();
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('generates a plan and stops at the plan approval gate by default', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-main-run-plan-'));
    const originalCwd = process.cwd();
    const originalOpenAiKey = process.env.OPENAI_API_KEY;
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    try {
      process.chdir(projectRoot);
      process.env.OPENAI_API_KEY = 'openai-key';
      await main(['node', 'bossflow', 'init']);
      setAgentOutputs(specification, plan);

      await main(['node', 'bossflow', 'run', 'Add export', '--confirm-project']);

      const [runId] = (await readdir(path.join(projectRoot, '.bossflow', 'runs'))).filter(
        (entry) => !entry.startsWith('.'),
      );
      const runDirectory = path.join(projectRoot, '.bossflow', 'runs', runId as string);
      const savedRun = JSON.parse(await readFile(path.join(runDirectory, 'run.json'), 'utf8'));
      expect(savedRun).toMatchObject({ stage: 'plan_approval' });
      await expect(readFile(path.join(runDirectory, 'plan.json'), 'utf8')).resolves.toContain(
        'Implement export',
      );
      await expect(readFile(path.join(runDirectory, 'plan.md'), 'utf8')).resolves.toContain(
        '# Technical Plan',
      );
      expect(stdout).toHaveBeenCalledWith(
        `Plan approval required: bossflow approve ${savedRun.id} --gate plan\n`,
      );
    } finally {
      process.chdir(originalCwd);
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
