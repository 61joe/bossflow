import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { GitError, simpleGit } from 'simple-git';

import { GitRepositoryInspector, isNotRepositoryError } from '../index.js';

describe('GitRepositoryInspector', () => {
  it('detects clean, dirty, and detached repository states', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-git-'));

    try {
      const git = simpleGit(projectRoot);
      await git.init(['--initial-branch=main']);
      await git.raw(['config', 'user.name', 'BossFlow Test']);
      await git.raw(['config', 'user.email', 'bossflow@example.com']);
      await writeFile(path.join(projectRoot, 'README.md'), '# Fixture\n', 'utf8');
      await git.add(['README.md']);
      await git.commit('Initial commit');

      const inspector = new GitRepositoryInspector();
      await expect(inspector.inspect(projectRoot)).resolves.toMatchObject({
        repositoryRoot: await realpath(projectRoot),
        status: {
          isRepository: true,
          branch: 'main',
          status: 'clean',
          changedPaths: [],
        },
      });

      await writeFile(path.join(projectRoot, 'dirty.txt'), 'change\n', 'utf8');
      await expect(inspector.inspect(projectRoot)).resolves.toMatchObject({
        status: {
          status: 'dirty',
          changedPaths: ['dirty.txt'],
        },
      });

      await git.raw(['checkout', '--detach']);
      const detached = await inspector.inspect(projectRoot);
      expect(detached.status.isRepository).toBe(true);
      expect(detached.status.branch).toBeUndefined();
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('returns a non-repository status outside Git', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-no-git-'));

    try {
      await expect(new GitRepositoryInspector().inspect(projectRoot)).resolves.toEqual({
        repositoryRoot: path.resolve(projectRoot),
        status: {
          isRepository: false,
          status: 'not-repository',
          changedPaths: [],
        },
      });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('distinguishes a missing repository from other Git errors', () => {
    expect(
      isNotRepositoryError(
        new GitError(undefined, 'fatal: not a git repository (or any parent): .git'),
      ),
    ).toBe(true);
    expect(isNotRepositoryError(new GitError(undefined, 'permission denied'))).toBe(false);
    expect(isNotRepositoryError(new Error('not a git repository'))).toBe(false);
  });

  it('propagates unexpected Git failures', async () => {
    const inspector = new GitRepositoryInspector(() => ({
      async revparse(): Promise<string> {
        throw new GitError(undefined, 'permission denied');
      },
      async status() {
        return { current: 'main', files: [] };
      },
    }));

    await expect(inspector.inspect('/tmp/project')).rejects.toThrow('permission denied');
  });
});
