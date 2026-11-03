export const DEFAULT_WORKTREE_ROOT_DIRECTORY = '.bossflow-worktrees';
export const WORKTREE_BRANCH_PREFIX = 'bossflow/run-';
export const DEFAULT_DIRTY_WORKTREE_STRATEGY = 'reject' as const;
export const MAX_WORKTREE_PATCH_BYTES = 4 * 1024 * 1024;
export const WORKTREE_BRANCH_REF_PREFIX = 'refs/heads/';
export const WORKTREE_LOCKS_DIRECTORY = '.locks';
export const DEFAULT_WORKTREE_LOCK_TIMEOUT_MS = 5_000;
export const DEFAULT_WORKTREE_LOCK_RETRY_DELAY_MS = 50;
export const DEFAULT_WORKTREE_LOCK_STALE_MS = 30_000;

export const SENSITIVE_WORKTREE_PATH_PATTERNS = [
  /(?:^|\/)\.env(?:\..*)?$/i,
  /(?:^|\/)credentials(?:\.local)?\.(?:json|ya?ml)$/i,
  /(?:^|\/)(?:id_rsa|id_ed25519|authorized_keys)$/i,
  /\.(?:pem|key|p12|pfx)$/i,
] as const;
