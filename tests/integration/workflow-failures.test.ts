import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { jest } from '@jest/globals';

import { FileRunStore, GitWorktreeManager, inspectProject } from '@bossflow/core';
import { CLI_EXIT_CODES, WorkflowService } from '@bossflow/cli';

import { createFakeWorkflowRuntime, createRepositoryFixture } from './support/index.js';

jest.setTimeout(30_000);

describe('controlled workflow failure integration', () => {
  it('blocks on a real failing verification command without touching main files', async () => {
    const fixture = await createRepositoryFixture('failing-verification');
    const fakes = createFakeWorkflowRuntime();
    const service = createService(fixture.root, fixture.worktreesRoot, fakes);
    const projectContext = await inspectProject(fixture.root);

    try {
      const created = await service.run({
        goal: 'Exercise failing verification.',
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
      ).rejects.toMatchObject({ exitCode: CLI_EXIT_CODES.BLOCKED });

      const blocked = await service.getRun(created.run.id);
      expect(blocked.stage).toBe('blocked');
      const runDirectory = path.join(fixture.root, '.bossflow', 'runs', created.run.id);
      await expect(
        readFile(path.join(runDirectory, 'verification.json'), 'utf8'),
      ).resolves.toContain('"status": "failed"');
      expect(fakes.getCallCounts().review).toBe(0);
    } finally {
      await fixture.cleanup();
    }
  });

  it('blocks when review has an unresolved high-severity finding', async () => {
    const fixture = await createRepositoryFixture('clean');
    const fakes = createFakeWorkflowRuntime({ reviewBlocked: true });
    const service = createService(fixture.root, fixture.worktreesRoot, fakes);
    const projectContext = await inspectProject(fixture.root);

    try {
      const created = await service.run({
        goal: 'Exercise a review blocker.',
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
      ).rejects.toMatchObject({ exitCode: CLI_EXIT_CODES.BLOCKED });
      const blocked = await service.getRun(created.run.id);
      expect(blocked.stage).toBe('blocked');
      await expect(service.status(created.run.id)).resolves.toMatchObject({
        reviewLine: '1 unresolved findings',
      });
    } finally {
      await fixture.cleanup();
    }
  });
});

describe('approval failure integration', () => {
  it('rejects resume after an approved plan artifact becomes stale', async () => {
    const fixture = await createRepositoryFixture('clean');
    const fakes = createFakeWorkflowRuntime();
    const store = new FileRunStore({
      runsRoot: path.join(fixture.root, '.bossflow', 'runs'),
    });
    const service = createService(fixture.root, fixture.worktreesRoot, fakes, store);
    const projectContext = await inspectProject(fixture.root);

    try {
      const created = await service.run({
        goal: 'Exercise stale approval handling.',
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
      const current = await store.read(created.run.id);
      await store.writeJson(current, 'plan.json', {
        ...(created.plan as object),
        summary: 'Changed after approval.',
      });

      await expect(
        service.resume({
          runId: created.run.id,
          modelRuntime: fakes.runtime,
          redactionSecrets: [],
        }),
      ).rejects.toMatchObject({ exitCode: CLI_EXIT_CODES.APPROVAL_REQUIRED });
      expect(fakes.getCallCounts().implementation).toBe(0);
    } finally {
      await fixture.cleanup();
    }
  });
});

function createService(
  projectRoot: string,
  worktreesRoot: string,
  fakes: ReturnType<typeof createFakeWorkflowRuntime>,
  store = new FileRunStore({
    runsRoot: path.join(projectRoot, '.bossflow', 'runs'),
  }),
): WorkflowService {
  return new WorkflowService({
    store,
    implementer: fakes.implementer,
    worktreeManager: new GitWorktreeManager({ managedRoot: worktreesRoot }),
    generateSpecification: fakes.generateSpecification,
    generateTechnicalPlan: fakes.generateTechnicalPlan,
    generateReview: fakes.generateReview,
  });
}
