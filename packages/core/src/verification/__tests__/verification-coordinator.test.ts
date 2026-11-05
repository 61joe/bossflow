/* eslint-disable max-lines -- Verification scenarios share command and recovery fixtures. */
import { jest } from '@jest/globals';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { ProjectProfile, VerificationCommand, VerificationResult } from '../../index.js';
import { FileRunStore } from '../../run-store/index.js';
import { VerificationCoordinator } from '../index.js';

const NOW = '2026-11-03T00:00:00.000Z';

describe('VerificationCoordinator', () => {
  it('runs commands, persists evidence, and advances to review', async () => {
    const fixture = await verificationRun([command('lint'), command('test')]);
    const runner = new FakeCommandRunner({ lint: 'passed', test: 'passed' });
    const coordinator = new VerificationCoordinator({
      store: fixture.store,
      commandRunner: runner,
      now: () => new Date(NOW),
    });

    try {
      const outcome = await coordinator.verify({ runId: fixture.run.id });
      expect(outcome).toMatchObject({
        status: 'passed',
        run: { stage: 'review' },
        report: { status: 'passed' },
      });
      const runDirectory = path.join(fixture.runsRoot, fixture.run.id);
      const report = JSON.parse(
        await readFile(path.join(runDirectory, 'verification.json'), 'utf8'),
      );
      expect(report.records).toHaveLength(2);
      await expect(readFile(path.join(runDirectory, 'verification.md'), 'utf8')).resolves.toContain(
        '# Verification',
      );
      await expect(coordinator.verify({ runId: fixture.run.id })).resolves.toMatchObject({
        status: 'already-completed',
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it('stops after a required failure and blocks the run', async () => {
    const fixture = await verificationRun([command('lint'), command('test')]);
    const runner = new FakeCommandRunner({ lint: 'failed' });
    const coordinator = new VerificationCoordinator({
      store: fixture.store,
      commandRunner: runner,
    });

    try {
      const outcome = await coordinator.verify({ runId: fixture.run.id });
      expect(outcome).toMatchObject({
        status: 'failed',
        failedCommandId: 'lint',
        run: { stage: 'blocked' },
      });
      expect(runner.calls.map((call) => call.command.id)).toEqual(['lint']);
      await expect(coordinator.verify({ runId: fixture.run.id })).resolves.toMatchObject({
        status: 'already-completed',
        run: { stage: 'blocked' },
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it('continues after an optional failure', async () => {
    const fixture = await verificationRun([command('lint', false), command('test')]);
    const runner = new FakeCommandRunner({ lint: 'failed', test: 'passed' });
    const coordinator = new VerificationCoordinator({
      store: fixture.store,
      commandRunner: runner,
    });

    try {
      await expect(coordinator.verify({ runId: fixture.run.id })).resolves.toMatchObject({
        status: 'passed',
        run: { stage: 'review' },
      });
      expect(runner.calls).toHaveLength(2);
    } finally {
      await fixture.cleanup();
    }
  });
});

describe('VerificationCoordinator validation', () => {
  it('rejects unsafe cwd, missing commands, stages, and worktrees', async () => {
    const fixture = await verificationRun([command('lint', true, '../outside')]);
    const coordinator = new VerificationCoordinator({
      store: fixture.store,
      commandRunner: new FakeCommandRunner({ lint: 'passed' }),
    });

    try {
      await expect(coordinator.verify({ runId: fixture.run.id })).rejects.toThrow(
        'outside the worktree',
      );
    } finally {
      await fixture.cleanup();
    }

    const noCommands = await verificationRun([], true, 'verify');
    try {
      await expect(
        new VerificationCoordinator({
          store: noCommands.store,
          commandRunner: new FakeCommandRunner({}),
        }).verify({ runId: noCommands.run.id }),
      ).rejects.toThrow('no verification commands');
    } finally {
      await noCommands.cleanup();
    }

    const noWorktree = await verificationRun([command('lint')], false);
    try {
      await expect(
        new VerificationCoordinator({
          store: noWorktree.store,
          commandRunner: new FakeCommandRunner({}),
        }).verify({ runId: noWorktree.run.id }),
      ).rejects.toThrow('no active verification worktree');
    } finally {
      await noWorktree.cleanup();
    }

    const wrongStage = await verificationRun([command('lint')], true, 'build');
    try {
      await expect(
        new VerificationCoordinator({
          store: wrongStage.store,
          commandRunner: new FakeCommandRunner({}),
        }).verify({ runId: wrongStage.run.id }),
      ).rejects.toThrow('requires the verify stage');
    } finally {
      await wrongStage.cleanup();
    }

    expect(
      new VerificationCoordinator({
        store: fixture.store,
      }),
    ).toBeInstanceOf(VerificationCoordinator);
    expect(
      new VerificationCoordinator({
        store: fixture.store,
        secrets: ['placeholder-secret'],
      }),
    ).toBeInstanceOf(VerificationCoordinator);
  });
});

describe('VerificationCoordinator persisted reports', () => {
  it('ignores a superseded verification report during a retry attempt', async () => {
    const fixture = await verificationRun([command('lint')]);
    const runner = new FakeCommandRunner({ lint: 'passed' });
    const coordinator = new VerificationCoordinator({
      store: fixture.store,
      commandRunner: runner,
    });

    try {
      await coordinator.verify({ runId: fixture.run.id });
      const completed = await fixture.store.read(fixture.run.id);
      const retry = await fixture.store.save({
        ...completed,
        stage: 'verify',
        attempt: 2,
        updatedAt: new Date(Date.parse(completed.updatedAt) + 1_000).toISOString(),
      });
      await fixture.store.archiveArtifacts(
        retry.id,
        ['verification.json', 'verification.md'],
        new Date(Date.parse(retry.updatedAt) + 1_000).toISOString(),
      );

      await expect(coordinator.verify({ runId: fixture.run.id })).resolves.toMatchObject({
        status: 'passed',
      });
      expect(runner.calls).toHaveLength(2);
    } finally {
      await fixture.cleanup();
    }
  });

  it('recovers a persisted report after a transition failure', async () => {
    const fixture = await verificationRun([command('lint')]);
    const originalTransition = fixture.store.transition.bind(fixture.store);
    jest.spyOn(fixture.store, 'transition').mockResolvedValueOnce({
      ok: false,
      from: 'verify',
      to: 'review',
      reason: 'transition failed',
    });
    const coordinator = new VerificationCoordinator({
      store: fixture.store,
      commandRunner: new FakeCommandRunner({ lint: 'passed' }),
      now: () => new Date(NOW),
    });

    try {
      await expect(coordinator.verify({ runId: fixture.run.id })).rejects.toThrow(
        'transition failed',
      );
      jest.restoreAllMocks();
      jest.spyOn(fixture.store, 'transition').mockResolvedValueOnce({
        ok: false,
        from: 'verify',
        to: 'review',
        reason: 'recovery transition failed',
      });
      await expect(coordinator.verify({ runId: fixture.run.id })).rejects.toThrow(
        'recovery transition failed',
      );
      jest.restoreAllMocks();
      await expect(coordinator.verify({ runId: fixture.run.id })).resolves.toMatchObject({
        status: 'already-completed',
        run: { stage: 'review' },
      });
    } finally {
      jest.restoreAllMocks();
      await fixture.cleanup();
      void originalTransition;
    }
  });

  it('rejects inconsistent or unowned verification reports', async () => {
    const fixture = await verificationRun([command('lint')]);
    const coordinator = new VerificationCoordinator({
      store: fixture.store,
      commandRunner: new FakeCommandRunner({ lint: 'passed' }),
    });

    try {
      await coordinator.verify({ runId: fixture.run.id });
      const verificationPath = path.join(fixture.runsRoot, fixture.run.id, 'verification.json');
      const report = JSON.parse(await readFile(verificationPath, 'utf8'));
      await fixture.store.writeJson(await fixture.store.read(fixture.run.id), 'verification.json', {
        ...report,
        runId: 'different-run',
      });
      await expect(coordinator.verify({ runId: fixture.run.id })).rejects.toThrow('different run');
    } finally {
      await fixture.cleanup();
    }

    const wrongStage = await verificationRun([command('lint')]);
    try {
      await new VerificationCoordinator({
        store: wrongStage.store,
        commandRunner: new FakeCommandRunner({ lint: 'passed' }),
      }).verify({ runId: wrongStage.run.id });
      const current = await wrongStage.store.read(wrongStage.run.id);
      await wrongStage.store.save({
        ...current,
        stage: 'completed',
        updatedAt: '2999-01-02T00:00:00.000Z',
      });
      await expect(
        new VerificationCoordinator({
          store: wrongStage.store,
          commandRunner: new FakeCommandRunner({ lint: 'passed' }),
        }).verify({ runId: wrongStage.run.id }),
      ).rejects.toThrow('cannot recover stage');
    } finally {
      await wrongStage.cleanup();
    }
  });
});

describe('VerificationCoordinator recovery edges', () => {
  it('propagates a blocked transition failure', async () => {
    const fixture = await verificationRun([command('lint')]);
    jest.spyOn(fixture.store, 'transition').mockResolvedValueOnce({
      ok: false,
      from: 'verify',
      to: 'blocked',
      reason: 'blocked transition failed',
    });

    try {
      await expect(
        new VerificationCoordinator({
          store: fixture.store,
          commandRunner: new FakeCommandRunner({ lint: 'failed' }),
        }).verify({ runId: fixture.run.id }),
      ).rejects.toThrow('blocked transition failed');
    } finally {
      jest.restoreAllMocks();
      await fixture.cleanup();
    }
  });

  it('rejects a modified verification artifact', async () => {
    const fixture = await verificationRun([command('lint')]);
    const coordinator = new VerificationCoordinator({
      store: fixture.store,
      commandRunner: new FakeCommandRunner({ lint: 'passed' }),
    });

    try {
      await coordinator.verify({ runId: fixture.run.id });
      const verificationPath = path.join(fixture.runsRoot, fixture.run.id, 'verification.json');
      const content = await readFile(verificationPath, 'utf8');
      await writeFile(verificationPath, `${content} `, 'utf8');
      await expect(coordinator.verify({ runId: fixture.run.id })).rejects.toThrow(
        'has been modified',
      );
    } finally {
      await fixture.cleanup();
    }
  });
});

class FakeCommandRunner {
  readonly calls: Array<{
    readonly command: VerificationCommand;
    readonly cwd: string;
  }> = [];
  readonly #statuses: Readonly<Record<string, 'passed' | 'failed'>>;

  constructor(statuses: Readonly<Record<string, 'passed' | 'failed'>>) {
    this.#statuses = statuses;
  }

  async run(commandToRun: VerificationCommand, cwd: string): Promise<VerificationResult> {
    this.calls.push({ command: commandToRun, cwd });
    const status = this.#statuses[commandToRun.id] ?? 'passed';
    return {
      commandId: commandToRun.id,
      status,
      ...(status === 'passed' ? { exitCode: 0 } : { exitCode: 1 }),
      startedAt: NOW,
      endedAt: NOW,
      durationMs: 0,
      stdout: '',
      stderr: '',
      redacted: true,
    };
  }
}

async function verificationRun(
  commands: readonly VerificationCommand[],
  withWorktree = true,
  stage: 'verify' | 'build' = 'verify',
) {
  const runsRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-verification-'));
  const repositoryPath = await mkdtemp(path.join(tmpdir(), 'bossflow-verification-repo-'));
  await mkdir(path.join(repositoryPath, 'worktree'));
  const store = new FileRunStore({ runsRoot });
  const run = await store.create({
    repositoryPath,
    goal: 'Verify implementation',
    modelProfile: 'openai',
    projectProfile: profile(commands),
  });
  const saved = await store.save({
    ...run,
    stage,
    ...(withWorktree
      ? {
          worktree: {
            path: path.join(repositoryPath, 'worktree'),
            branch: 'bossflow/run-verification',
            baseCommit: 'a'.repeat(40),
            createdAt: NOW,
            status: 'active' as const,
          },
        }
      : {}),
    updatedAt: '2999-01-01T00:00:00.000Z',
  });
  return {
    runsRoot,
    store,
    run: saved,
    cleanup: async () => {
      await rm(runsRoot, { recursive: true, force: true });
      await rm(repositoryPath, { recursive: true, force: true });
    },
  };
}

function command(id: string, required = true, cwd?: string): VerificationCommand {
  return {
    id,
    label: id,
    command: 'node',
    args: ['--version'],
    required,
    timeoutMs: 1_000,
    ...(cwd === undefined ? {} : { cwd }),
  };
}

function profile(commands: readonly VerificationCommand[]): ProjectProfile {
  return {
    schemaVersion: 1,
    repositoryRoot: '/tmp/project',
    git: {
      isRepository: true,
      branch: 'main',
      status: 'clean',
      changedPaths: [],
    },
    packageManager: 'pnpm',
    languages: ['TypeScript'],
    frameworks: [],
    conventionFiles: [],
    planningContextFiles: [],
    testConfigFiles: [],
    packageScripts: {},
    verificationCommands: commands,
    ambiguities: [],
    requiresConfirmation: false,
    confirmedByUser: true,
  };
}
