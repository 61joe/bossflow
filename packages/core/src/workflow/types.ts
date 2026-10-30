export type WorkflowStage =
  'spec' | 'plan' | 'build' | 'verify' | 'review' | 'completed' | 'blocked' | 'failed';

export interface WorkflowRun {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly repositoryPath: string;
  readonly goal: string;
  readonly modelProfile: string;
  readonly model?: string;
  readonly stage: WorkflowStage;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type TransitionResult =
  | {
      readonly ok: true;
      readonly run: WorkflowRun;
    }
  | {
      readonly ok: false;
      readonly from: WorkflowStage;
      readonly to: WorkflowStage;
      readonly reason: string;
    };
