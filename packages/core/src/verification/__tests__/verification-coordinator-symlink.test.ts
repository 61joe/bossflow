import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { ProjectProfile, VerificationCommand } from '../../index.js';
import { FileRunStore } from '../../run-store/index.js';
import { VerificationCoordinator } from '../index.js';

describe('VerificationCoordinator worktree boundary', () => {
  it('rejects a cwd symlink that escapes the worktree', async () => {
    const runsRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-verification-symlink-'));
    const repositoryPath = await mkdtemp(
      path.join(tmpdir(), 'bossflow-verification-symlink-repo-'),
    );
    const outsidePath = await mkdtemp(
      path.join(tmpdir(), 'bossflow-verification-symlink-outside-'),
    );
    const worktreePath = path.join(repositoryPath, 'worktree');
    const command = verificationCommand('outside-link');

    try {
      await mkdir(worktreePath);
      await symlink(outsidePath, path.join(worktreePath, command.cwd ?? ''), 'dir');
      const store = new FileRunStore({ runsRoot });
      const run = await store.create({
        repositoryPath,
        goal: 'Reject an escaped verification cwd',
        modelProfile: 'openai',
        projectProfile: projectProfile(command),
      });
      const saved = await store.save({
        ...run,
        stage: 'verify',
        worktree: {
          path: worktreePath,
          branch: 'bossflow/run-verification-symlink',
          baseCommit: 'a'.repeat(40),
          createdAt: '2026-11-03T00:00:00.000Z',
          status: 'active',
        },
        updatedAt: '2999-01-01T00:00:00.000Z',
      });

      await expect(
        new VerificationCoordinator({
          store,
          commandRunner: {
            run: async () => {
              throw new Error('The escaped command must not run.');
            },
          },
        }).verify({ runId: saved.id }),
      ).rejects.toThrow('outside the worktree');
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
      await rm(repositoryPath, { recursive: true, force: true });
      await rm(outsidePath, { recursive: true, force: true });
    }
  });
});

function verificationCommand(cwd: string): VerificationCommand {
  return {
    id: 'lint',
    label: 'Lint',
    command: 'node',
    args: ['--version'],
    required: true,
    timeoutMs: 1_000,
    cwd,
  };
}

function projectProfile(command: VerificationCommand): ProjectProfile {
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
    verificationCommands: [command],
    ambiguities: [],
    requiresConfirmation: false,
    confirmedByUser: true,
  };
}
