import type { WorkflowStage } from './types.js';

export const INITIAL_WORKFLOW_STAGE = 'spec' satisfies WorkflowStage;

export const WORKFLOW_TRANSITIONS = {
  spec: ['plan', 'blocked', 'failed'],
  plan: ['build', 'blocked', 'failed'],
  build: ['verify', 'blocked', 'failed'],
  verify: ['review', 'build', 'blocked', 'failed'],
  review: ['completed', 'build', 'blocked', 'failed'],
  completed: [],
  blocked: ['spec', 'plan', 'build'],
  failed: ['spec', 'plan', 'build'],
} as const satisfies Readonly<Record<WorkflowStage, readonly WorkflowStage[]>>;
