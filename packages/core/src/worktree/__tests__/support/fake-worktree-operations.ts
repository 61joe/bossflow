import { mkdir, rm } from 'node:fs/promises';

import type { GitWorktreeInfo, GitWorktreeOperations, WorktreeGitStatus } from '../../index.js';

export class FakeWorktreeOperations implements GitWorktreeOperations {
  head = 'a'.repeat(40);
  branchCommit = 'a'.repeat(40);
  status: WorktreeGitStatus = {
    isDirty: false,
    fingerprint: 'clean',
  };
  worktrees: GitWorktreeInfo[] = [];
  branches = new Set<string>();
  trackedPaths: string[] = [];
  untrackedPaths: string[] = [];
  patch = '';
  added: Array<{
    readonly worktreePath: string;
    readonly branch: string;
    readonly createBranch: boolean;
  }> = [];
  removed: Array<{ readonly worktreePath: string; readonly force: boolean }> = [];
  pruned = 0;

  async resolveRevision(_repositoryPath: string, revision: string): Promise<string> {
    return revision.startsWith('bossflow/') ? this.branchCommit : this.head;
  }

  async readStatus(): Promise<WorktreeGitStatus> {
    return this.status;
  }

  async listWorktrees(): Promise<readonly GitWorktreeInfo[]> {
    return this.worktrees;
  }

  async branchExists(_repositoryPath: string, branch: string): Promise<boolean> {
    return this.branches.has(branch);
  }

  async addWorktree(options: {
    readonly worktreePath: string;
    readonly branch: string;
    readonly createBranch: boolean;
  }): Promise<void> {
    await mkdir(options.worktreePath, { recursive: true });
    this.added.push(options);
    this.branches.add(options.branch);
    this.worktrees.push({
      path: options.worktreePath,
      head: this.head,
      branch: options.branch,
      isMain: false,
    });
  }

  async changedPaths(): Promise<{
    readonly tracked: readonly string[];
    readonly untracked: readonly string[];
  }> {
    return {
      tracked: this.trackedPaths,
      untracked: this.untrackedPaths,
    };
  }

  async createPatch(): Promise<string> {
    return this.patch;
  }

  async removeWorktree(
    _repositoryPath: string,
    worktreePath: string,
    force: boolean,
  ): Promise<void> {
    this.removed.push({ worktreePath, force });
    this.worktrees = this.worktrees.filter((worktree) => worktree.path !== worktreePath);
    await rm(worktreePath, { recursive: true, force: true });
  }

  async deleteBranch(_repositoryPath: string, branch: string): Promise<void> {
    this.branches.delete(branch);
  }

  async pruneWorktrees(): Promise<void> {
    this.pruned += 1;
  }
}
