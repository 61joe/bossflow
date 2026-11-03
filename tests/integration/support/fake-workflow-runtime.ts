import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { DevelopmentSpecification, ModelRuntime, TechnicalPlan } from '@bossflow/core';

import type { FakeWorkflowRuntime, FakeWorkflowRuntimeOptions } from './types.js';

const SPECIFICATION: DevelopmentSpecification = {
  title: 'Integration fixture workflow',
  problem: 'Exercise the controlled development loop without model network calls.',
  scope: ['Create one deterministic source file and verify the workflow.'],
  nonGoals: ['External Git operations'],
  acceptanceCriteria: ['The controlled workflow completes with persisted evidence.'],
  constraints: ['Business files are written only inside the run worktree.'],
};

const PLAN: TechnicalPlan = {
  schemaVersion: 1,
  summary: 'Create deterministic output and validate it.',
  affectedPaths: ['src'],
  tasks: [
    {
      id: 'task-1',
      title: 'Create deterministic output',
      description: 'Write a generated source file inside the implementation worktree.',
      dependencies: [],
      affectedPaths: ['src/generated.ts'],
      acceptanceCriteria: ['The controlled workflow completes with persisted evidence.'],
    },
  ],
  interfaceChanges: [],
  risks: [],
  verificationCommands: [
    {
      id: 'fixture-test',
      label: 'Fixture test',
      command: 'node',
      args: ['-e', 'process.exit(0)'],
      required: true,
      timeoutMs: 1_000,
    },
  ],
};

export function createFakeWorkflowRuntime(
  options: FakeWorkflowRuntimeOptions = {},
): FakeWorkflowRuntime {
  const calls = {
    specification: 0,
    plan: 0,
    implementation: 0,
    review: 0,
  };
  const runtime = {
    provider: {
      getModel: () => {
        throw new Error('The deterministic workflow runtime must not call a model provider.');
      },
    },
    structuredOutputMode: 'native',
  } as unknown as ModelRuntime;

  return {
    runtime,
    generateSpecification: async () => {
      calls.specification += 1;
      return SPECIFICATION;
    },
    generateTechnicalPlan: async () => {
      calls.plan += 1;
      return PLAN;
    },
    generateReview: async (input) => {
      calls.review += 1;
      const review = {
        schemaVersion: 1 as const,
        summary: `Reviewed ${input.verificationEvidence.length} verification commands.`,
        findings:
          options.reviewBlocked === true
            ? [
                {
                  id: 'finding-1',
                  severity: 'P1' as const,
                  title: 'Deterministic review blocker',
                  description: 'The fixture requires a user-visible review blocker.',
                  status: 'open' as const,
                },
              ]
            : [],
        requirementCoverage: [
          {
            requirementId: 'acceptance-1',
            criterion: SPECIFICATION.acceptanceCriteria[0] ?? 'Workflow completes.',
            status: 'covered' as const,
            evidence: input.verificationEvidence.map(
              (result) => `${result.commandId}: ${result.status}`,
            ),
          },
        ],
        unresolvedFindingIds: options.reviewBlocked === true ? ['finding-1'] : [],
      };
      return review;
    },
    implementer: async (context) => {
      calls.implementation += 1;
      const outputPath = path.join(context.worktreePath, 'src', 'generated.ts');
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, 'export const generatedByBossFlow = true;\n', 'utf8');
      return {
        schemaVersion: 1,
        status: 'completed',
        summary: 'Created deterministic integration output.',
        changedPaths: ['src/generated.ts'],
        testChanges: [],
        notes: [],
      };
    },
    getCallCounts: () => ({ ...calls }),
  };
}
