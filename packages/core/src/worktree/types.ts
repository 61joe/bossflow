/**
 * Policy applied when the main worktree contains uncommitted changes.
 *
 * - `reject`: Refuse to create a run worktree.
 * - `use-head`: Create from the committed HEAD without copying local changes.
 */
export type DirtyWorktreeStrategy = 'reject' | 'use-head';

/**
 * Snapshot used to verify that a repository state has not changed.
 */
export interface WorktreeGitStatus {
  /** Whether tracked, staged, or untracked files differ from the current commit. */
  readonly isDirty: boolean;

  /**
   * Stable SHA-256 fingerprint covering status output, HEAD, and branch.
   *
   * @remarks
   * Treat this value as opaque and compare it only for equality.
   */
  readonly fingerprint: string;
}

/**
 * Git metadata for one registered worktree.
 */
export interface GitWorktreeInfo {
  /** Canonical absolute path to the worktree. */
  readonly path: string;

  /** Full commit SHA currently checked out in the worktree. */
  readonly head: string;

  /**
   * Short local branch name without the `refs/heads/` prefix.
   * Undefined when the worktree has a detached HEAD.
   */
  readonly branch?: string | undefined;

  /** Whether this is the primary repository worktree. */
  readonly isMain: boolean;
}

/**
 * Low-level Git worktree operations used by `GitWorktreeManager`.
 *
 * @remarks
 * Implementations must preserve Git exit status and must not invoke commands through a shell.
 */
export interface GitWorktreeOperations {
  /**
   * Resolves a revision to a full commit SHA.
   *
   * @throws When Git cannot inspect the repository or the revision does not exist.
   */
  resolveRevision(repositoryPath: string, revision: string): Promise<string>;

  /** Captures the current status, HEAD, and branch fingerprint. */
  readStatus(repositoryPath: string): Promise<WorktreeGitStatus>;

  /**
   * Lists all worktrees registered for the repository, including the primary worktree.
   * Returned paths are normalized absolute paths.
   */
  listWorktrees(repositoryPath: string): Promise<readonly GitWorktreeInfo[]>;

  /** Checks whether a local branch exists. */
  branchExists(repositoryPath: string, branch: string): Promise<boolean>;

  /** Creates a worktree from an existing commit. */
  addWorktree(options: {
    /** Repository used to register the worktree. */
    readonly repositoryPath: string;

    /** Canonical destination path for the new worktree. */
    readonly worktreePath: string;

    /** Short local branch name to create or attach. */
    readonly branch: string;

    /** Full commit SHA that the worktree branch must reference. */
    readonly baseCommit: string;

    /**
     * When true, create `branch` from `baseCommit`.
     * When false, attach an existing branch that must already point to `baseCommit`.
     */
    readonly createBranch: boolean;
  }): Promise<void>;

  /**
   * Lists repository-relative paths changed from a base commit.
   *
   * @remarks
   * Returned paths use `/` separators. Tracked and untracked paths are reported separately.
   */
  changedPaths(
    worktreePath: string,
    baseCommit: string,
  ): Promise<{
    /** Paths tracked by Git, including modified or deleted files. */
    readonly tracked: readonly string[];

    /** Files that are not tracked and are not excluded by repository ignore rules. */
    readonly untracked: readonly string[];
  }>;

  /**
   * Creates a unified binary-capable patch for the requested paths.
   *
   * @remarks
   * The caller is responsible for excluding sensitive paths. Patch content may still contain
   * secrets and must be redacted before logging or persistence.
   *
   * @throws When Git fails or the patch exceeds the configured size limit.
   */
  createPatch(options: {
    /** Worktree containing the changed files. */
    readonly worktreePath: string;

    /** Full commit SHA used as the diff baseline. */
    readonly baseCommit: string;

    /** Repository-relative tracked paths to include. */
    readonly trackedPaths: readonly string[];

    /** Repository-relative untracked paths to include as new-file diffs. */
    readonly untrackedPaths: readonly string[];
  }): Promise<string>;

  /**
   * Removes a registered worktree.
   *
   * @param force - When true, discard uncommitted worktree changes.
   * @throws When the path is not a registered worktree or removal fails.
   */
  removeWorktree(repositoryPath: string, worktreePath: string, force: boolean): Promise<void>;

  /**
   * Force-deletes a local branch.
   *
   * @remarks
   * This operation is destructive and should only run after explicit user cleanup approval.
   */
  deleteBranch(repositoryPath: string, branch: string): Promise<void>;

  /** Removes stale Git worktree registrations without touching valid worktrees. */
  pruneWorktrees(repositoryPath: string): Promise<void>;
}

/**
 * Inputs for idempotently creating or reusing a run worktree.
 */
export interface CreateWorktreeOptions {
  /** Validated run identifier used in the managed path and branch name. */
  readonly runId: string;

  /** Repository root or a directory inside the repository. */
  readonly repositoryPath: string;

  /**
   * Revision used when creating a new worktree. Defaults to `HEAD`.
   * Resume operations must pass the previously persisted base commit.
   */
  readonly baseRef?: string;

  /** Overrides the manager's default policy for a dirty main worktree. */
  readonly dirtyStrategy?: DirtyWorktreeStrategy;

  /**
   * Root directory containing managed worktrees.
   * Defaults to a sibling `.bossflow-worktrees/<repository-name>` directory.
   */
  readonly managedRoot?: string;

  /** Original creation timestamp preserved when an existing worktree is reused. */
  readonly createdAt?: string;

  /** ISO timestamp used for newly generated worktree metadata. */
  readonly now?: string;
}

/**
 * Configuration for a `GitWorktreeManager`.
 */
export interface WorktreeManagerOptions {
  /** Default root directory for managed worktrees. */
  readonly managedRoot?: string;

  /** Default dirty-main-worktree policy. */
  readonly dirtyStrategy?: DirtyWorktreeStrategy;

  /** Alternate Git operations implementation, primarily for testing or platform adaptation. */
  readonly operations?: GitWorktreeOperations;

  /** Maximum time to wait for a per-run worktree lock, in milliseconds. */
  readonly lockTimeoutMs?: number;

  /** Delay between worktree lock acquisition attempts, in milliseconds. */
  readonly lockRetryDelayMs?: number;

  /** Age after which an abandoned lock may be removed, in milliseconds. */
  readonly lockStaleMs?: number;
}

/**
 * File-lock behavior for serializing worktree lifecycle operations.
 */
export interface WorktreeLockOptions {
  /** Maximum time to wait for lock acquisition, in milliseconds. */
  readonly lockTimeoutMs?: number;

  /** Delay between lock acquisition attempts, in milliseconds. */
  readonly lockRetryDelayMs?: number;

  /** Age after which an existing lock is treated as abandoned, in milliseconds. */
  readonly lockStaleMs?: number;
}

/**
 * Inputs controlling explicit run worktree cleanup.
 */
export interface CleanupWorktreeOptions {
  /**
   * When true, discard uncommitted worktree changes during removal.
   *
   * @remarks
   * This can permanently delete implementation work that has not been committed.
   */
  readonly force?: boolean;

  /**
   * When true, delete the associated local branch after removing the worktree.
   * Defaults to false so the branch can be retained for recovery.
   */
  readonly deleteBranch?: boolean;

  /** ISO timestamp recorded as the cleanup time. */
  readonly now?: string;
}

/**
 * Filters for listing managed worktrees or detecting orphaned directories.
 */
export interface WorktreeListOptions {
  /** Repository whose registered worktrees should be inspected. */
  readonly repositoryPath: string;

  /** Root containing managed worktrees; defaults to the manager configuration. */
  readonly managedRoot?: string;
}

/**
 * Repository-relative evidence generated from a worktree implementation.
 */
export interface WorktreeDiff {
  /** Tracked paths changed from the base commit. */
  readonly trackedPaths: readonly string[];

  /** Untracked paths not excluded by repository ignore rules. */
  readonly untrackedPaths: readonly string[];

  /** Sorted union of tracked and untracked paths using `/` separators. */
  readonly changedPaths: readonly string[];

  /** Changed paths excluded from `patch` because their content may contain secrets. */
  readonly sensitivePaths: readonly string[];

  /**
   * Unified binary-capable patch for non-sensitive paths.
   *
   * @remarks
   * Sensitive paths are excluded, but patch content may still contain secrets.
   * Redact the patch before logging or persisting it.
   */
  readonly patch: string;
}
