export {
  DEFAULT_DIRTY_WORKTREE_STRATEGY,
  DEFAULT_WORKTREE_ROOT_DIRECTORY,
  MAX_WORKTREE_PATCH_BYTES,
  SENSITIVE_WORKTREE_PATH_PATTERNS,
  WORKTREE_BRANCH_PREFIX,
} from './constant.js';
export { SimpleGitWorktreeOperations } from './git-worktree-operations.js';
export { GitWorktreeManager } from './worktree-manager.js';
export type {
  CleanupWorktreeOptions,
  CreateWorktreeOptions,
  DirtyWorktreeStrategy,
  GitWorktreeInfo,
  GitWorktreeOperations,
  WorktreeDiff,
  WorktreeGitStatus,
  WorktreeListOptions,
  WorktreeManagerOptions,
} from './types.js';
