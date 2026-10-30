import { WORKFLOW_TRANSITIONS } from './constant.js';
import type { TransitionResult, WorkflowRun, WorkflowStage } from './types.js';

export function canTransition(from: WorkflowStage, to: WorkflowStage): boolean {
  const allowedStages: readonly WorkflowStage[] = WORKFLOW_TRANSITIONS[from];
  return allowedStages.includes(to);
}

export function transitionWorkflow(
  run: WorkflowRun,
  to: WorkflowStage,
  updatedAt: string,
): TransitionResult {
  if (!canTransition(run.stage, to)) {
    return {
      ok: false,
      from: run.stage,
      to,
      reason: `Transition from "${run.stage}" to "${to}" is not allowed.`,
    };
  }

  return {
    ok: true,
    run: {
      ...run,
      stage: to,
      updatedAt,
    },
  };
}
