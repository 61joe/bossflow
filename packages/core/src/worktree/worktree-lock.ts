import { mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import {
  DEFAULT_WORKTREE_LOCK_RETRY_DELAY_MS,
  DEFAULT_WORKTREE_LOCK_STALE_MS,
  DEFAULT_WORKTREE_LOCK_TIMEOUT_MS,
  WORKTREE_LOCKS_DIRECTORY,
} from './constant.js';
import type { WorktreeLockOptions } from './types.js';

export class WorktreeLock {
  readonly #timeoutMs: number;
  readonly #retryDelayMs: number;
  readonly #staleMs: number;

  constructor(options: WorktreeLockOptions = {}) {
    this.#timeoutMs = options.lockTimeoutMs ?? DEFAULT_WORKTREE_LOCK_TIMEOUT_MS;
    this.#retryDelayMs = options.lockRetryDelayMs ?? DEFAULT_WORKTREE_LOCK_RETRY_DELAY_MS;
    this.#staleMs = options.lockStaleMs ?? DEFAULT_WORKTREE_LOCK_STALE_MS;
  }

  async withLock<T>(managedRoot: string, key: string, operation: () => Promise<T>): Promise<T> {
    const locksRoot = path.join(managedRoot, WORKTREE_LOCKS_DIRECTORY);
    const lockPath = path.join(locksRoot, `${key}.lock`);
    const deadline = Date.now() + this.#timeoutMs;
    await mkdir(locksRoot, { recursive: true });
    while (true) {
      try {
        await mkdir(lockPath);
        break;
      } catch (error: unknown) {
        if (!isFileExistsError(error)) {
          throw error;
        }
        if (Date.now() >= deadline) {
          if (await this.#isStale(lockPath)) {
            await rm(lockPath, { recursive: true, force: true });
            continue;
          }
          throw new Error(`Timed out acquiring worktree lock "${key}".`, {
            cause: error,
          });
        }
        await delay(this.#retryDelayMs);
      }
    }

    try {
      return await operation();
    } finally {
      await rm(lockPath, { recursive: true, force: true });
    }
  }

  async #isStale(lockPath: string): Promise<boolean> {
    try {
      return Date.now() - (await stat(lockPath)).mtimeMs >= this.#staleMs;
    } catch {
      // A lock removed while waiting is already available for the next retry.
      return true;
    }
  }
}

function isFileExistsError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST';
}
