export const APPROVAL_GATES = ['plan', 'review', 'external-action'] as const;
export const APPROVAL_DECISIONS = ['approved', 'rejected'] as const;
export const APPROVAL_ACTIONS = ['commit', 'push', 'merge', 'pr'] as const;
export const WORKTREE_STATUSES = ['active', 'cleaned'] as const;
export const ARTIFACT_KINDS = [
  'request',
  'spec',
  'plan',
  'implementation',
  'decision',
  'verification',
  'review',
  'summary',
  'other',
] as const;
export const RISK_SEVERITIES = ['low', 'medium', 'high'] as const;
export const VERIFICATION_STATUSES = ['passed', 'failed', 'skipped'] as const;
export const REVIEW_SEVERITIES = ['P0', 'P1', 'P2', 'P3'] as const;
export const REVIEW_STATUSES = ['open', 'resolved', 'waived'] as const;
export const COVERAGE_STATUSES = ['covered', 'partial', 'missing'] as const;
export const IMPLEMENTATION_RESULT_STATUSES = ['completed', 'blocked'] as const;
export const SUMMARY_STATUSES = ['completed', 'blocked', 'failed'] as const;
export const RUN_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
