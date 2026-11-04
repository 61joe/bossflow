import { jest } from '@jest/globals';

import type {
  DevelopmentSpecification,
  ImplementationAgentInput,
  ImplementationResult,
  ReviewerAgentInput,
  TechnicalPlan,
  TechnicalPlanAgentInput,
} from '../../../index.js';
import type { ModelRuntime, StructuredOutputMode } from '../../../models/index.js';

export const SPECIFICATION: DevelopmentSpecification = {
  title: 'Specialist agents',
  problem: 'The workflow needs structured specialist roles.',
  scope: ['Add specialist agent contracts'],
  nonGoals: ['Automatic merging'],
  acceptanceCriteria: ['Plans and reviews are validated.'],
  constraints: ['Do not modify files before approval.'],
};

export const TECHNICAL_PLAN: TechnicalPlan = {
  schemaVersion: 1,
  summary: 'Add structured specialist agents.',
  affectedPaths: ['packages/core/src/agents'],
  tasks: [
    {
      id: 'task-1',
      title: 'Add agents',
      description: 'Create specialist agents and orchestration.',
      dependencies: [],
      affectedPaths: ['packages/core/src/agents'],
      acceptanceCriteria: ['Each role returns validated output.'],
    },
  ],
  interfaceChanges: [
    {
      path: 'packages/core/src/agents/index.ts',
      description: 'Export the specialist workflow API.',
    },
  ],
  risks: [],
  verificationCommands: [
    {
      id: 'test',
      label: 'Test',
      command: 'pnpm',
      args: ['test'],
      required: true,
      timeoutMs: 120_000,
    },
  ],
};

export const TECHNICAL_PLAN_INPUT: TechnicalPlanAgentInput = {
  specification: SPECIFICATION,
  repositoryContext: 'TypeScript pnpm workspace.',
};

export const IMPLEMENTATION_INPUT: ImplementationAgentInput = {
  plan: TECHNICAL_PLAN,
  approvedPaths: ['packages/core/src/agents'],
  testExpectations: ['Add role contract tests.'],
  repositoryContext: 'TypeScript pnpm workspace.',
};

export const IMPLEMENTATION_RESULT: ImplementationResult = {
  schemaVersion: 1,
  status: 'completed',
  summary: 'Added specialist agents.',
  changedPaths: ['packages/core/src/agents/orchestrator.ts'],
  testChanges: ['Added orchestrator tests.'],
  notes: [],
};

export const REVIEWER_INPUT: ReviewerAgentInput = {
  specification: SPECIFICATION,
  plan: TECHNICAL_PLAN,
  diff: 'diff --git a/packages/core/src/agents/index.ts b/packages/core/src/agents/index.ts',
  verificationEvidence: [
    {
      commandId: 'test',
      status: 'passed',
      exitCode: 0,
      startedAt: '2026-11-02T00:00:00.000Z',
      endedAt: '2026-11-02T00:00:01.000Z',
      durationMs: 1_000,
      stdout: '93 tests passed',
      stderr: '',
      redacted: true,
    },
  ],
  verificationContext: {
    authoritativeCommands: TECHNICAL_PLAN.verificationCommands,
    executedCommandIds: ['test'],
    advisoryPlanCommands: [],
    missingRequiredCommandIds: [],
  },
};

export function createRuntime(structuredOutputMode: StructuredOutputMode = 'native'): ModelRuntime {
  return {
    provider: { getModel: jest.fn() } as unknown as ModelRuntime['provider'],
    structuredOutputMode,
    ...(structuredOutputMode === 'prompt-json' ? { model: 'compatible-model' } : {}),
  };
}
