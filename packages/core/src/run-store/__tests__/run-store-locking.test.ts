import { chmod, mkdir, mkdtemp, rm, symlink, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { FileRunStore } from '../index.js';

describe('FileRunStore locking', () => {
  it('recovers stale locks and times out active locks', async () => {
    const runsRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-runs-'));

    try {
      const store = new FileRunStore({
        runsRoot,
        lockRetryDelayMs: 1,
        lockStaleMs: 1,
        lockTimeoutMs: 10,
      });
      const run = await store.create({
        repositoryPath: '/tmp/project',
        goal: 'Lock recovery',
        modelProfile: 'openai',
      });
      const lockDirectory = path.join(runsRoot, '.locks', `${run.id}.lock`);
      await mkdir(lockDirectory, { recursive: true });
      await utimes(lockDirectory, new Date(0), new Date(0));
      await expect(
        store.transition(run.id, 'plan', '2026-11-02T00:01:00.000Z'),
      ).resolves.toMatchObject({ ok: true });

      const timeoutStore = new FileRunStore({
        runsRoot,
        lockRetryDelayMs: 1,
        lockStaleMs: 10_000,
        lockTimeoutMs: 10,
      });
      await mkdir(lockDirectory, { recursive: true });
      await expect(timeoutStore.save(await timeoutStore.read(run.id))).rejects.toThrow(
        'Timed out acquiring run lock',
      );
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('handles vanished locks and lock stat errors', async () => {
    const runsRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-runs-'));

    try {
      const store = new FileRunStore({
        runsRoot,
        lockRetryDelayMs: 1,
        lockStaleMs: 1,
        lockTimeoutMs: 0,
      });
      const run = await store.create({
        repositoryPath: '/tmp/project',
        goal: 'Broken lock',
        modelProfile: 'openai',
      });
      await mkdir(path.join(runsRoot, '.locks'), { recursive: true });
      const lockDirectory = path.join(runsRoot, '.locks', `${run.id}.lock`);
      await symlink('missing-target', lockDirectory);
      await expect(
        store.transition(run.id, 'plan', '2026-11-02T00:01:00.000Z'),
      ).resolves.toMatchObject({ ok: true });

      await symlink(path.basename(lockDirectory), lockDirectory);
      await expect(store.save(await store.read(run.id))).rejects.toThrow('ELOOP');
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('propagates lock creation errors other than EEXIST', async () => {
    const runsRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-runs-'));
    const locksDirectory = path.join(runsRoot, '.locks');

    try {
      const store = new FileRunStore({
        runsRoot,
        lockRetryDelayMs: 1,
        lockTimeoutMs: 10,
      });
      const run = await store.create({
        repositoryPath: '/tmp/project',
        goal: 'Permission failure',
        modelProfile: 'openai',
      });
      await mkdir(locksDirectory, { recursive: true });
      await chmod(locksDirectory, 0o500);

      await expect(store.save(await store.read(run.id))).rejects.toMatchObject({
        code: 'EACCES',
      });
    } finally {
      await chmod(locksDirectory, 0o700).catch(() => undefined);
      await rm(runsRoot, { recursive: true, force: true });
    }
  });
});
