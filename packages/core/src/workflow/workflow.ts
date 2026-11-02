import type { ApprovalGate } from '../contracts/index.js';
import { REQUIRED_APPROVAL_BY_TRANSITION, WORKFLOW_TRANSITIONS } from './constant.js';
import type {
  TransitionResult,
  TransitionWorkflowOptions,
  WorkflowRun,
  WorkflowStage,
} from './types.js';

export function canTransition(from: WorkflowStage, to: WorkflowStage): boolean {
  const allowedStages: readonly WorkflowStage[] = WORKFLOW_TRANSITIONS[from];
  return allowedStages.includes(to);
}

export function transitionWorkflow(
  run: WorkflowRun,
  to: WorkflowStage,
  updatedAt: string,
  options: TransitionWorkflowOptions = {},
): TransitionResult {
  if (run.stage === to) {
    return {
      ok: true,
      run,
    };
  }

  const rejectionReason = getTransitionRejection(run, to, options);
  if (rejectionReason !== undefined) {
    return {
      ok: false,
      from: run.stage,
      to,
      reason: rejectionReason,
    };
  }

  const { failure: _failure, ...runWithoutFailure } = run;
  void _failure;

  return {
    ok: true,
    run: {
      ...runWithoutFailure,
      stage: to,
      workflowRevision: (run.workflowRevision ?? 1) + 1,
      approvals: run.approvals ?? [],
      artifacts: run.artifacts ?? [],
      updatedAt,
      ...(to === 'failed' && options.failure !== undefined ? { failure: options.failure } : {}),
    },
  };
}

function getTransitionRejection(
  run: WorkflowRun,
  to: WorkflowStage,
  options: TransitionWorkflowOptions,
): string | undefined {
  if (!canTransition(run.stage, to)) {
    return `Transition from "${run.stage}" to "${to}" is not allowed.`;
  }

  const requiredApproval = getRequiredApproval(run.stage, to);
  if (requiredApproval !== undefined && !hasCurrentApproval(run, requiredApproval)) {
    return `Transition from "${run.stage}" to "${to}" requires a current "${requiredApproval}" approval.`;
  }

  if (to === 'failed' && options.failure === undefined) {
    return 'Transition to "failed" requires terminal failure metadata.';
  }

  return undefined;
}

function getRequiredApproval(from: WorkflowStage, to: WorkflowStage): ApprovalGate | undefined {
  const key = `${from}:${to}` as keyof typeof REQUIRED_APPROVAL_BY_TRANSITION;
  return REQUIRED_APPROVAL_BY_TRANSITION[key];
}

function hasCurrentApproval(run: WorkflowRun, gate: ApprovalGate): boolean {
  const revision = run.workflowRevision ?? 1;
  const approvals = run.approvals ?? [];

  for (const approval of [...approvals].reverse()) {
    if (approval.gate !== gate || approval.workflowRevision !== revision) {
      continue;
    }
    if (approval.decision !== 'approved') {
      return false;
    }

    const artifactKind = gate === 'plan' ? 'plan' : 'review';
    const artifact = [...(run.artifacts ?? [])]
      .reverse()
      .find(
        (candidate) =>
          candidate.kind === artifactKind && candidate.fileName === approval.artifactFileName,
      );
    return artifact?.sha256 !== undefined && artifact.sha256 === approval.artifactSha256;
  }

  return false;
}
