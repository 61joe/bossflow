import type { WorkflowStage } from './types.js';

export const WORKFLOW_SCHEMA_VERSION = 1 as const;
export const INITIAL_WORKFLOW_REVISION = 1;
export const INITIAL_WORKFLOW_STAGE = 'spec' satisfies WorkflowStage;
export const WORKFLOW_STAGES = [
  'spec',
  'plan',
  'plan_approval',
  'build',
  'verify',
  'review',
  'review_approval',
  'completed',
  'blocked',
  'failed',
] as const satisfies readonly WorkflowStage[];

export const WORKFLOW_TRANSITIONS = {
  spec: ['plan', 'blocked', 'failed'],
  plan: ['plan_approval', 'blocked', 'failed'],
  plan_approval: ['build', 'blocked', 'failed'],
  build: ['verify', 'blocked', 'failed'],
  verify: ['review', 'build', 'blocked', 'failed'],
  review: ['review_approval', 'build', 'blocked', 'failed'],
  review_approval: ['completed', 'blocked', 'failed'],
  completed: [],
  blocked: ['spec', 'plan', 'build'],
  failed: ['spec', 'plan', 'build'],
} as const satisfies Readonly<Record<WorkflowStage, readonly WorkflowStage[]>>;

export const REQUIRED_APPROVAL_BY_TRANSITION = {
  'plan_approval:build': 'plan',
  'review_approval:completed': 'review',
} as const;
