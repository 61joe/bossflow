import type { ProjectContextBundle, TechnicalPlan, WorkflowRun } from '@bossflow/core';

import { renderRepositoryContext, renderTechnicalPlan, renderWorkflowStatus } from '../index.js';

describe('workflow renderer', () => {
  it('renders tasks, interfaces, risks, commands, and bounded project documents', () => {
    const plan: TechnicalPlan = {
      schemaVersion: 1,
      summary: 'Render the plan.',
      affectedPaths: ['src'],
      tasks: [
        {
          id: 'task-1',
          title: 'Render',
          description: 'Render output.',
          dependencies: ['task-0'],
          affectedPaths: ['src'],
          acceptanceCriteria: ['Output exists'],
        },
      ],
      interfaceChanges: [{ path: 'src/index.ts', description: 'Add CLI API.' }],
      risks: [{ description: 'Formatting risk.', severity: 'low', mitigation: 'Test output.' }],
      verificationCommands: [
        {
          id: 'test',
          label: 'Test',
          command: 'pnpm',
          args: ['test'],
          required: true,
          timeoutMs: 1_000,
        },
      ],
    };
    const projectContext: ProjectContextBundle = {
      profile: createProjectProfile('/tmp/project'),
      documents: [
        {
          path: 'AGENTS.md',
          content: 'Follow instructions.',
          truncated: true,
        },
      ],
    };

    expect(renderTechnicalPlan(plan)).toContain('- Dependencies: task-0');
    expect(renderTechnicalPlan(plan)).toContain('src/index.ts: Add CLI API.');
    expect(renderTechnicalPlan(plan)).toContain('low: Formatting risk.');
    expect(renderRepositoryContext(projectContext)).toContain('AGENTS.md (truncated)');
    expect(
      renderRepositoryContext({
        ...projectContext,
        documents: [{ path: 'README.md', content: 'Read me.', truncated: false }],
      }),
    ).toContain('## README.md\nRead me.');
  });

  it('renders empty plan sections and failed workflow metadata', () => {
    const plan: TechnicalPlan = {
      schemaVersion: 1,
      summary: 'No extras.',
      affectedPaths: ['src'],
      tasks: [
        {
          id: 'task-1',
          title: 'Implement',
          description: 'Implement.',
          dependencies: [],
          affectedPaths: ['src'],
          acceptanceCriteria: ['Works'],
        },
      ],
      interfaceChanges: [],
      risks: [],
      verificationCommands: [
        {
          id: 'test',
          label: 'Test',
          command: 'pnpm',
          args: ['test'],
          required: false,
          timeoutMs: 1_000,
        },
      ],
    };
    expect(renderTechnicalPlan(plan)).toContain('- Dependencies: none');
    expect(renderTechnicalPlan(plan)).toContain('- None.');
    expect(renderTechnicalPlan(plan)).toContain('(optional');

    const run: WorkflowRun = {
      ...createRun(),
      stage: 'failed',
      failure: {
        stage: 'plan',
        code: 'PLAN_FAILED',
        message: 'Plan failed.',
        occurredAt: '2026-11-03T00:00:00.000Z',
        retryable: true,
      },
    };
    const status = renderWorkflowStatus({
      run,
      artifactLines: [],
      approvalLines: [],
      verificationLine: 'not recorded',
      reviewLine: 'not recorded',
      nextAction: 'Create a new run.',
    });
    expect(status).toContain('Failure: PLAN_FAILED: Plan failed.');
    expect(
      renderWorkflowStatus({
        run: { ...createRun(), workflowRevision: undefined },
        artifactLines: [],
        approvalLines: [],
        verificationLine: 'not recorded',
        reviewLine: 'not recorded',
        nextAction: 'Resume.',
      }),
    ).toContain('Revision: 1');
  });
});

function createRun(): WorkflowRun {
  return {
    schemaVersion: 1,
    id: 'run-1',
    repositoryPath: '/tmp/project',
    goal: 'Render workflow',
    modelProfile: 'openai',
    stage: 'spec',
    attempt: 1,
    workflowRevision: 1,
    approvals: [],
    artifacts: [],
    createdAt: '2026-11-03T00:00:00.000Z',
    updatedAt: '2026-11-03T00:00:00.000Z',
  };
}

function createProjectProfile(repositoryRoot: string) {
  return {
    schemaVersion: 1 as const,
    repositoryRoot,
    git: {
      isRepository: true,
      branch: 'main',
      status: 'clean' as const,
      changedPaths: [],
    },
    packageManager: 'pnpm' as const,
    languages: ['TypeScript'],
    frameworks: [],
    conventionFiles: [],
    planningContextFiles: [],
    testConfigFiles: [],
    packageScripts: {},
    verificationCommands: [],
    ambiguities: [],
    requiresConfirmation: false,
    confirmedByUser: true,
  };
}
