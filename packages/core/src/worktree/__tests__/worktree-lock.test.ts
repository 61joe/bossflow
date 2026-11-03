import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { WorktreeLock } from '../worktree-lock.js';

describe('WorktreeLock', () => {
  it('propagates lock filesystem errors that are not contention', async () => {
    const managedRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-lock-error-'));

    try {
      await expect(
        new WorktreeLock().withLock(managedRoot, 'missing/child', async () => 'value'),
      ).rejects.toThrow();
    } finally {
      await rm(managedRoot, { recursive: true, force: true });
    }
  });

  it('recovers a dangling lock symlink as stale', async () => {
    const managedRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-lock-stale-'));
    const locksRoot = path.join(managedRoot, '.locks');
    await mkdir(locksRoot, { recursive: true });
    await symlink(path.join(managedRoot, 'missing-target'), path.join(locksRoot, 'run-1.lock'));

    try {
      await expect(
        new WorktreeLock({
          lockTimeoutMs: 1,
          lockRetryDelayMs: 1,
          lockStaleMs: 1,
        }).withLock(managedRoot, 'run-1', async () => 'value'),
      ).resolves.toBe('value');
    } finally {
      await rm(managedRoot, { recursive: true, force: true });
    }
  });
});
