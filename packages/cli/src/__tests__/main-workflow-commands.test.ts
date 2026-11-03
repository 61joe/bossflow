/* eslint-disable max-lines, max-lines-per-function -- Workflow command scenarios share a single CLI fixture. */
import { jest } from '@jest/globals';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { FileRunStore } from '@bossflow/core';

import { getResumeMessages, main } from '../index.js';

const specification = {
  title: 'Controlled workflow',
  problem: 'The workflow needs CLI gates.',
  scope: ['Expose the workflow'],
  nonGoals: [],
  acceptanceCriteria: ['The CLI respects gates'],
  constraints: [],
};

const plan = {
  schemaVersion: 1,
  summary: 'Expose workflow commands.',
  affectedPaths: ['src'],
  tasks: [
    {
      id: 'task-1',
      title: 'Expose commands',
      description: 'Add status, approval, and resume commands.',
      dependencies: [],
      affectedPaths: ['src'],
      acceptanceCriteria: ['The CLI respects gates'],
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
      required: true,
      timeoutMs: 1_000,
    },
  ],
};

describe('workflow CLI commands', () => {
  it('renders resume gate messages for every terminal outcome', () => {
    const base = {
      schemaVersion: 1 as const,
      id: 'run-1',
      repositoryPath: '/tmp/project',
      goal: 'Resume',
      modelProfile: 'openai',
      workflowRevision: 1,
      approvals: [],
      artifacts: [],
      createdAt: '2026-11-03T00:00:00.000Z',
      updatedAt: '2026-11-03T00:00:00.000Z',
    };
    expect(getResumeMessages({ ...base, stage: 'plan_approval' })).toContain(
      'Plan approval required: bossflow approve run-1 --gate plan',
    );
    expect(getResumeMessages({ ...base, stage: 'review_approval' })).toContain(
      'Review approval required: bossflow approve run-1 --gate review --action <commit|push|merge|pr>',
    );
    expect(getResumeMessages({ ...base, stage: 'completed' })).toContain('Workflow completed.');
    expect(getResumeMessages({ ...base, stage: 'review' })).toEqual([
      'Run run-1 stopped at stage "review".',
    ]);
  });

  it('inspects status, rejects unapproved resume, and records plan approval', async () => {
    const fixture = await createPlanRun();

    try {
      await expect(main(['node', 'bossflow', 'status', fixture.runId])).resolves.toBe(0);
      expect(fixture.stdout).toHaveBeenCalledWith(expect.stringContaining('Stage: plan_approval'));
      expect(fixture.stdout).toHaveBeenCalledWith(
        expect.stringContaining(`bossflow approve ${fixture.runId} --gate plan`),
      );

      await expect(main(['node', 'bossflow', 'resume', fixture.runId])).resolves.toBe(4);
      expect(fixture.stderr).toHaveBeenCalledWith(
        expect.stringContaining('requires "plan" approval'),
      );

      await expect(
        main([
          'node',
          'bossflow',
          'approve',
          fixture.runId,
          '--gate',
          'plan',
          '--actor',
          'reviewer',
          '--note',
          'scope approved',
        ]),
      ).resolves.toBe(0);
      const saved = await fixture.store.read(fixture.runId);
      expect(saved.approvals).toEqual([
        expect.objectContaining({
          gate: 'plan',
          actor: 'reviewer',
          notes: 'scope approved',
          artifactFileName: 'plan.json',
        }),
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('resumes a specification run and stops at plan approval', async () => {
    const fixture = await createSpecificationRun();

    try {
      await expect(main(['node', 'bossflow', 'resume', fixture.runId])).resolves.toBe(0);
      const saved = await fixture.store.read(fixture.runId);
      expect(saved.stage).toBe('plan_approval');
      expect(fixture.stdout).toHaveBeenCalledWith(
        `Plan approval required: bossflow approve ${fixture.runId} --gate plan\n`,
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it('records review approval for only the requested external actions', async () => {
    const fixture = await createReviewRun();

    try {
      await expect(
        main([
          'node',
          'bossflow',
          'approve',
          fixture.runId,
          '--gate',
          'review',
          '--action',
          'commit',
          '--action',
          'pr',
          '--note',
          'approved release actions',
        ]),
      ).resolves.toBe(0);
      await expect(
        main([
          'node',
          'bossflow',
          'approve',
          fixture.runId,
          '--gate',
          'review',
          '--action',
          'commit',
          '--action',
          'pr',
        ]),
      ).resolves.toBe(0);

      const saved = await fixture.store.read(fixture.runId);
      expect(saved.approvals).toHaveLength(3);
      expect(saved.approvals).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ gate: 'review', artifactFileName: 'review.json' }),
          expect.objectContaining({ gate: 'external-action', actions: ['commit'] }),
          expect.objectContaining({ gate: 'external-action', actions: ['pr'] }),
        ]),
      );
      expect(fixture.stdout).toHaveBeenCalledWith('Authorized external actions: commit, pr.\n');
      await expect(main(['node', 'bossflow', 'status', fixture.runId])).resolves.toBe(0);
      expect(fixture.stdout).toHaveBeenCalledWith(
        expect.stringContaining('external-action: approved'),
      );
      delete process.env.OPENAI_API_KEY;
      await expect(main(['node', 'bossflow', 'resume', fixture.runId])).resolves.toBe(0);
      expect(fixture.stdout).toHaveBeenCalledWith('Workflow completed.\n');
    } finally {
      await fixture.cleanup();
    }
  });

  it('records review approval without authorizing external actions', async () => {
    const fixture = await createReviewRun();

    try {
      await expect(
        main([
          'node',
          'bossflow',
          'approve',
          fixture.runId,
          '--gate',
          'review',
          '--actor',
          'reviewer',
        ]),
      ).resolves.toBe(0);
      const saved = await fixture.store.read(fixture.runId);
      expect(saved.approvals).toEqual([
        expect.objectContaining({ gate: 'review', actor: 'reviewer' }),
      ]);
      expect(fixture.stdout).toHaveBeenCalledWith('No external actions were authorized.\n');
    } finally {
      await fixture.cleanup();
    }
  });

  it('rejects invalid command options with the usage exit code', async () => {
    const fixture = await createBaseFixture();

    try {
      await expect(main(['node', 'bossflow', 'run', 'goal', '--stop-after', 'plan'])).resolves.toBe(
        2,
      );
      await expect(
        main(['node', 'bossflow', 'approve', 'run-1', '--gate', 'invalid']),
      ).resolves.toBe(2);
      await expect(
        main(['node', 'bossflow', 'approve', 'run-1', '--gate', 'review', '--action', 'invalid']),
      ).resolves.toBe(2);
    } finally {
      await fixture.cleanup();
    }
  });

  it('returns failed for a modified artifact without a recovery hint', async () => {
    const fixture = await createBaseFixture();
    await main(['node', 'bossflow', 'init']);
    const created = await fixture.store.create({
      repositoryPath: fixture.projectRoot,
      goal: 'Controlled workflow',
      modelProfile: 'openai',
    });
    await fixture.store.writeJson(created, 'spec.json', specification);
    await fixture.store.writeJson(created, 'plan.json', plan);
    const current = await fixture.store.read(created.id);
    await fixture.store.save({
      ...current,
      stage: 'plan',
      updatedAt: new Date().toISOString(),
    });
    await writeFile(
      path.join(fixture.projectRoot, '.bossflow', 'runs', created.id, 'plan.json'),
      '{}',
    );

    try {
      await expect(main(['node', 'bossflow', 'resume', created.id])).resolves.toBe(6);
      expect(fixture.stderr).toHaveBeenCalledWith('Artifact "plan.json" has been modified.\n');
    } finally {
      await fixture.cleanup();
    }
  });

  it('rejects approval when the current artifact content was modified', async () => {
    const fixture = await createPlanRun();
    await writeFile(
      path.join(fixture.projectRoot, '.bossflow', 'runs', fixture.runId, 'plan.json'),
      '{}',
    );

    try {
      await expect(
        main(['node', 'bossflow', 'approve', fixture.runId, '--gate', 'plan']),
      ).resolves.toBe(6);
      expect(fixture.stderr).toHaveBeenCalledWith('Artifact "plan.json" has been modified.\n');
    } finally {
      await fixture.cleanup();
    }
  });

  it('returns stable non-zero codes for missing runs and gates', async () => {
    const fixture = await createBaseFixture();

    try {
      await main(['node', 'bossflow', 'init']);
      await expect(main(['node', 'bossflow', 'status', 'missing-run'])).resolves.toBe(3);
      expect(fixture.stderr).toHaveBeenCalledWith('Run "missing-run" was not found.\n');

      const { run } = await createStoredRun(fixture.projectRoot, fixture.store, false);
      await expect(main(['node', 'bossflow', 'approve', run.id, '--gate', 'plan'])).resolves.toBe(
        4,
      );
      expect(fixture.stderr).toHaveBeenCalledWith(
        expect.stringContaining('requires stage "plan_approval"'),
      );
    } finally {
      await fixture.cleanup();
    }
  });
});

async function createPlanRun() {
  const fixture = await createBaseFixture();
  await main(['node', 'bossflow', 'init']);
  const { run } = await createStoredRun(fixture.projectRoot, fixture.store, true);
  return { ...fixture, runId: run.id };
}

async function createSpecificationRun() {
  const fixture = await createBaseFixture();
  await main(['node', 'bossflow', 'init']);
  const created = await fixture.store.create({
    repositoryPath: fixture.projectRoot,
    goal: 'Controlled workflow',
    modelProfile: 'openai',
    model: 'override-model',
  });
  await fixture.store.writeJson(created, 'spec.json', specification);
  await fixture.store.writeJson(created, 'plan.json', plan);
  const current = await fixture.store.read(created.id);
  const run = await fixture.store.save({
    ...current,
    stage: 'plan',
    updatedAt: new Date().toISOString(),
  });
  return { ...fixture, runId: run.id };
}

async function createReviewRun() {
  const fixture = await createBaseFixture();
  await main(['node', 'bossflow', 'init']);
  const store = new FileRunStore({
    runsRoot: path.join(fixture.projectRoot, '.bossflow', 'runs'),
  });
  const created = await store.create({
    repositoryPath: fixture.projectRoot,
    goal: 'Review workflow',
    modelProfile: 'openai',
    model: 'override-model',
  });
  await store.writeJson(created, 'review.json', {
    schemaVersion: 1,
    summary: 'Ready.',
    findings: [],
    requirementCoverage: [
      {
        requirementId: 'acceptance-1',
        criterion: 'Covered.',
        status: 'covered',
        evidence: ['test'],
      },
    ],
    unresolvedFindingIds: [],
  });
  const run = await store.read(created.id);
  await store.save({
    ...run,
    stage: 'review_approval',
    updatedAt: new Date().toISOString(),
  });
  return { ...fixture, store, runId: created.id };
}

async function createBaseFixture() {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-main-workflow-'));
  const originalCwd = process.cwd();
  const originalKey = process.env.OPENAI_API_KEY;
  const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  process.chdir(projectRoot);
  process.env.OPENAI_API_KEY = 'openai-key';
  const store = new FileRunStore({
    runsRoot: path.join(projectRoot, '.bossflow', 'runs'),
  });
  return {
    projectRoot,
    store,
    stdout,
    stderr,
    cleanup: async () => {
      process.chdir(originalCwd);
      if (originalKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalKey;
      }
      stdout.mockRestore();
      stderr.mockRestore();
      await rm(projectRoot, { recursive: true, force: true });
    },
  };
}

async function createStoredRun(projectRoot: string, store: FileRunStore, includePlan: boolean) {
  const created = await store.create({
    repositoryPath: projectRoot,
    goal: 'Controlled workflow',
    modelProfile: 'openai',
  });
  await store.writeJson(created, 'spec.json', specification);
  if (!includePlan) {
    return { run: await store.read(created.id) };
  }
  await store.writeJson(created, 'plan.json', plan);
  const current = await store.read(created.id);
  return {
    run: await store.save({
      ...current,
      stage: 'plan_approval',
      updatedAt: new Date().toISOString(),
    }),
  };
}
