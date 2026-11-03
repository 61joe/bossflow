import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import { jest } from '@jest/globals';

import { FileRunStore, GitWorktreeManager, inspectProject } from '@bossflow/core';
import { WorkflowService } from '@bossflow/cli';

import {
  REPOSITORY_FIXTURE_SCENARIOS,
  createFakeWorkflowRuntime,
  createRepositoryFixture,
  runGit,
} from './support/index.js';

jest.setTimeout(30_000);

describe('controlled workflow integration', () => {
  it.each(REPOSITORY_FIXTURE_SCENARIOS)(
    'creates a deterministic %s fixture repository',
    async (scenario) => {
      const fixture = await createRepositoryFixture(scenario);

      try {
        const context = await inspectProject(fixture.root);
        const expectedStatus = scenario === 'dirty' ? 'dirty' : 'clean';
        expect(context.profile.git.status).toBe(expectedStatus);
        expect(context.profile.packageManager).toBe('pnpm');
        if (scenario === 'dirty') {
          expect(context.profile.git.changedPaths).toContain('dirty.txt');
        }
        if (scenario === 'missing-command') {
          expect(context.profile.requiresConfirmation).toBe(true);
          expect(context.profile.ambiguities).toEqual(
            expect.arrayContaining([
              expect.stringContaining('No typecheck command'),
              expect.stringContaining('No test command'),
              expect.stringContaining('No build command'),
            ]),
          );
        } else {
          expect(context.profile.verificationCommands).toHaveLength(4);
        }
        if (scenario === 'multi-package') {
          expect(context.profile.languages).toContain('TypeScript');
        }
        if (scenario === 'failing-verification') {
          expect(context.profile.packageScripts.test).toContain('process.exit(1)');
        }
      } finally {
        await fixture.cleanup();
      }
    },
  );

  it('runs Spec → Plan → approval → worktree → Verify → Review → Summary', async () => {
    const fixture = await createRepositoryFixture('clean');
    const fakes = createFakeWorkflowRuntime();
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
    const mainBefore = await snapshotMainWorktree(fixture.root);

    try {
      const created = await service.run({
        goal: 'Exercise the complete controlled workflow.',
        projectContext,
        modelRuntime: fakes.runtime,
        modelProfile: 'fixture',
        confirmedProject: true,
        stopAfterSpec: false,
      });
      expect(created.run.stage).toBe('plan_approval');

      await service.approve({
        runId: created.run.id,
        gate: 'plan',
        actions: [],
        actor: 'fixture-user',
      });
      const reviewed = await service.resume({
        runId: created.run.id,
        modelRuntime: fakes.runtime,
        redactionSecrets: [],
      });
      expect(reviewed.stage).toBe('review_approval');
      expect(reviewed.worktree?.path).toBeDefined();
      const worktreePath = reviewed.worktree?.path as string;
      await expect(
        readFile(path.join(worktreePath, 'src', 'generated.ts'), 'utf8'),
      ).resolves.toContain('generatedByBossFlow');
      await expect(access(path.join(fixture.root, 'src', 'generated.ts'))).rejects.toThrow();
      expect(await snapshotMainWorktree(fixture.root)).toEqual(mainBefore);

      const status = await service.status(created.run.id);
      expect(status.verificationLine).toContain('passed');
      expect(status.reviewLine).toContain('0 unresolved findings');
      const runDirectory = path.join(fixture.root, '.bossflow', 'runs', created.run.id);
      await expect(readFile(path.join(runDirectory, 'summary.md'), 'utf8')).resolves.toContain(
        '## Verification',
      );

      await service.approve({
        runId: created.run.id,
        gate: 'review',
        actions: ['commit', 'pr'],
        actor: 'fixture-user',
      });
      const completed = await service.resume({
        runId: created.run.id,
        modelRuntime: fakes.runtime,
        redactionSecrets: [],
      });
      expect(completed.stage).toBe('completed');
      expect(fakes.getCallCounts()).toEqual({
        specification: 1,
        plan: 1,
        implementation: 1,
        review: 1,
      });
      expect(await snapshotMainWorktree(fixture.root)).toEqual(mainBefore);
    } finally {
      await fixture.cleanup();
    }
  });
});

async function snapshotMainWorktree(root: string) {
  const [head, branch, status, readme, source] = await Promise.all([
    runGit(root, ['rev-parse', 'HEAD']),
    runGit(root, ['rev-parse', '--abbrev-ref', 'HEAD']),
    runGit(root, ['status', '--porcelain=v1', '-z']),
    readFile(path.join(root, 'README.md'), 'utf8'),
    readFile(path.join(root, 'src', 'index.ts'), 'utf8'),
  ]);
  return {
    head: head.trim(),
    branch: branch.trim(),
    status,
    readme,
    source,
  };
}
