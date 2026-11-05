/* eslint-disable max-lines-per-function -- Retry CLI scenarios share one temporary project fixture. */
import { jest } from '@jest/globals';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { FileRunStore } from '@bossflow/core';

import { main } from '../index.js';
import { WorkflowService } from '../workflow/index.js';

describe('retry CLI command', () => {
  it('rejects unsupported options and invalid run states before execution', async () => {
    const fixture = await createFixture();

    try {
      await expect(main(['node', 'bossflow', 'retry', 'run-1', '--from', 'review'])).resolves.toBe(
        2,
      );
      await expect(main(['node', 'bossflow', 'retry', 'run-1'])).resolves.toBe(2);
      await expect(main(['node', 'bossflow', 'retry', 'missing', '--from', 'build'])).resolves.toBe(
        3,
      );

      const active = await fixture.store.create({
        repositoryPath: fixture.projectRoot,
        goal: 'Active run',
        modelProfile: 'openai',
      });
      await fixture.store.save({
        ...active,
        stage: 'build',
        updatedAt: new Date(Date.now() + 1_000).toISOString(),
      });
      await expect(main(['node', 'bossflow', 'retry', active.id, '--from', 'build'])).resolves.toBe(
        4,
      );

      const completed = await fixture.store.create({
        repositoryPath: fixture.projectRoot,
        goal: 'Completed run',
        modelProfile: 'openai',
      });
      await fixture.store.save({
        ...completed,
        stage: 'completed',
        updatedAt: new Date(Date.now() + 1_000).toISOString(),
      });
      await expect(
        main(['node', 'bossflow', 'retry', completed.id, '--from', 'verify']),
      ).resolves.toBe(4);
    } finally {
      await fixture.cleanup();
    }
  });

  it('accepts a failed run and reports the missing approved Plan evidence', async () => {
    const fixture = await createFixture();

    try {
      const failed = await fixture.store.create({
        repositoryPath: fixture.projectRoot,
        goal: 'Failed run',
        modelProfile: 'openai',
      });
      await fixture.store.save({
        ...failed,
        stage: 'failed',
        failure: {
          stage: 'build',
          code: 'BUILD_FAILED',
          message: 'Build failed.',
          occurredAt: new Date().toISOString(),
          retryable: true,
        },
        updatedAt: new Date(Date.now() + 1_000).toISOString(),
      });

      await expect(main(['node', 'bossflow', 'retry', failed.id, '--from', 'build'])).resolves.toBe(
        7,
      );
      expect(fixture.stderr).toHaveBeenCalledWith(
        expect.stringContaining('has no current Plan artifact'),
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it('reports the next gate after a successful retry', async () => {
    const fixture = await createFixture();
    const blocked = await fixture.store.create({
      repositoryPath: fixture.projectRoot,
      goal: 'Blocked run',
      modelProfile: 'openai',
      model: 'override-model',
    });
    const saved = await fixture.store.save({
      ...blocked,
      stage: 'blocked',
      updatedAt: new Date(Date.now() + 1_000).toISOString(),
    });
    const retry = jest.spyOn(WorkflowService.prototype, 'retry').mockResolvedValue({
      ...saved,
      stage: 'review_approval',
    });

    try {
      await expect(
        main([
          'node',
          'bossflow',
          'retry',
          saved.id,
          '--from',
          'verify',
          '--verification',
          'browser',
        ]),
      ).resolves.toBe(0);
      expect(retry).toHaveBeenCalledWith(
        expect.objectContaining({
          runId: saved.id,
          from: 'verify',
          verificationCommandIds: ['browser'],
        }),
      );
      expect(fixture.stdout).toHaveBeenCalledWith(
        'Review approval required: ' +
          `bossflow approve ${saved.id} --gate review --action <commit|push|merge|pr>\n`,
      );
    } finally {
      retry.mockRestore();
      await fixture.cleanup();
    }
  });
});

async function createFixture() {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-retry-cli-'));
  const originalCwd = process.cwd();
  const originalKey = process.env.OPENAI_API_KEY;
  const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  process.chdir(projectRoot);
  process.env.OPENAI_API_KEY = 'openai-key';
  await main(['node', 'bossflow', 'init']);
  const store = new FileRunStore({
    runsRoot: path.join(projectRoot, '.bossflow', 'runs'),
  });
  return {
    projectRoot,
    store,
    stdout,
    stderr,
    cleanup: async () => {
      process.chdir(originalCwd);
      if (originalKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalKey;
      }
      stdout.mockRestore();
      stderr.mockRestore();
      await rm(projectRoot, { recursive: true, force: true });
    },
  };
}
