/* eslint-disable max-lines-per-function -- Retry evidence scenarios share one disposable repository. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { jest } from '@jest/globals';

import { FileRunStore, GitWorktreeManager, inspectProject } from '@bossflow/core';
import type { TechnicalPlan, VerificationCommand } from '@bossflow/core';
import { WorkflowService } from '@bossflow/cli';

import { createFakeWorkflowRuntime, createRepositoryFixture, runGit } from './support/index.js';

jest.setTimeout(30_000);

const BROWSER_COMMAND: VerificationCommand = {
  id: 'browser-check',
  label: 'Browser check',
  command: 'node',
  args: ['-e', 'process.exit(0)'],
  required: true,
  timeoutMs: 1_000,
};

const PLAN: TechnicalPlan = {
  schemaVersion: 1,
  summary: 'Create deterministic output and validate browser behavior.',
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
  verificationCommands: [BROWSER_COMMAND],
};

describe('retry evidence integration', () => {
  it('adopts a Plan browser check on Verify retry and replaces a blocked Review', async () => {
    const fixture = await createRepositoryFixture('clean');
    const fakes = createFakeWorkflowRuntime({
      technicalPlan: PLAN,
      reviewer: async (input) => {
        const hasBrowserEvidence = input.verificationEvidence.some(
          (evidence) => evidence.commandId === BROWSER_COMMAND.id && evidence.status === 'passed',
        );
        return {
          schemaVersion: 1,
          summary: hasBrowserEvidence
            ? 'Browser evidence is complete.'
            : 'Browser evidence is missing.',
          findings: hasBrowserEvidence
            ? []
            : [
                {
                  id: 'browser-missing',
                  severity: 'P1',
                  title: 'Browser evidence is missing',
                  description: 'The browser acceptance check did not run.',
                  status: 'open',
                  verificationCommandId: BROWSER_COMMAND.id,
                },
              ],
          requirementCoverage: [
            {
              requirementId: 'acceptance-1',
              criterion: 'The controlled workflow completes with persisted evidence.',
              status: hasBrowserEvidence ? 'covered' : 'partial',
              evidence: input.verificationEvidence.map(
                (evidence) => `${evidence.commandId}: ${evidence.status}`,
              ),
            },
          ],
          unresolvedFindingIds: hasBrowserEvidence ? [] : ['browser-missing'],
        };
      },
    });
    const store = new FileRunStore({
      runsRoot: path.join(fixture.root, '.bossflow', 'runs'),
    });
    const service = new WorkflowService({
      store,
      implementer: fakes.implementer,
      worktreeManager: new GitWorktreeManager({ managedRoot: fixture.worktreesRoot }),
      generateSpecification: fakes.generateSpecification,
      generateTechnicalPlan: fakes.generateTechnicalPlan,
      generateReview: fakes.generateReview,
    });
    const projectContext = await inspectProject(fixture.root);
    const mainHead = (await runGit(fixture.root, ['rev-parse', 'HEAD'])).trim();
    const mainStatus = await runGit(fixture.root, ['status', '--porcelain=v1', '-z']);

    try {
      const created = await service.run({
        goal: 'Exercise browser evidence recovery.',
        projectContext,
        modelRuntime: fakes.runtime,
        modelProfile: 'fixture',
        confirmedProject: true,
        stopAfterSpec: false,
      });
      await service.approve({
        runId: created.run.id,
        gate: 'plan',
        actions: [],
        actor: 'fixture-user',
      });
      await expect(
        service.resume({
          runId: created.run.id,
          modelRuntime: fakes.runtime,
          redactionSecrets: [],
        }),
      ).rejects.toMatchObject({ exitCode: 5 });

      const blocked = await service.getRun(created.run.id);
      expect(blocked.stage).toBe('blocked');
      expect(blocked.attempt).toBe(1);

      const retried = await service.retry({
        runId: created.run.id,
        from: 'verify',
        modelRuntime: fakes.runtime,
        redactionSecrets: [],
        verificationCommandIds: [BROWSER_COMMAND.id],
      });
      expect(retried).toMatchObject({
        stage: 'review_approval',
        attempt: 2,
      });
      expect(retried.approvals).toEqual([
        expect.objectContaining({ gate: 'plan', decision: 'approved' }),
      ]);
      expect(retried.projectProfile?.verificationCommands).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: BROWSER_COMMAND.id })]),
      );

      const runDirectory = path.join(fixture.root, '.bossflow', 'runs', created.run.id);
      const verification = JSON.parse(
        await readFile(path.join(runDirectory, 'verification.json'), 'utf8'),
      );
      expect(
        verification.records.map((record: { command: { id: string } }) => record.command.id),
      ).toEqual(expect.arrayContaining(['test', BROWSER_COMMAND.id]));
      const previousReview = JSON.parse(
        await readFile(path.join(runDirectory, 'attempt-1-review.json'), 'utf8'),
      );
      expect(previousReview.findings).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: 'browser-missing' })]),
      );
      const currentReview = JSON.parse(
        await readFile(path.join(runDirectory, 'review.json'), 'utf8'),
      );
      expect(currentReview.findings).toEqual([]);
      expect(await service.status(created.run.id).then((status) => status.run.stage)).toBe(
        'review_approval',
      );
      expect((await runGit(fixture.root, ['rev-parse', 'HEAD'])).trim()).toBe(mainHead);
      expect(await runGit(fixture.root, ['status', '--porcelain=v1', '-z'])).toBe(mainStatus);
      expect(fakes.getCallCounts()).toEqual({
        specification: 1,
        plan: 1,
        implementation: 1,
        review: 2,
      });
    } finally {
      await fixture.cleanup();
    }
  });
});
