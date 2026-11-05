import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { FileRunStore } from '@bossflow/core';
import type { ApprovalRecord } from '@bossflow/core';

import {
  buildConformanceReport,
  getConformanceScenario,
  writeConformanceReport,
} from '../index.js';

const NOW = '2026-11-04T00:01:00.000Z';

describe('conformance report', () => {
  it('collects a completed run and writes sanitized evidence', async () => {
    const fixture = await createReportFixture('completed');
    const secret = 'deepseek-super-secret-value';

    try {
      const report = await buildConformanceReport({
        runId: fixture.run.id,
        runsRoot: fixture.runsRoot,
        scenario: getConformanceScenario('single-js-export'),
        now: () => new Date(NOW),
        secrets: [secret],
      });

      expect(report).toMatchObject({
        adapterId: 'codex',
        scenarioId: 'single-js-export',
        projectProfile: {
          id: 'single-package-javascript',
          packageManager: 'pnpm',
          languages: ['JavaScript'],
        },
        runId: fixture.run.id,
        stage: 'completed',
        outcome: 'completed',
        changedPaths: ['src/index.js'],
        verification: [
          { commandId: 'test', status: 'passed', exitCode: 0 },
          { commandId: 'optional', status: 'skipped' },
        ],
        reviewFindings: [
          {
            id: 'finding-1',
            severity: 'P2',
            title: 'Review [REDACTED]',
            status: 'open',
            verificationCommandId: 'test',
          },
          {
            id: 'finding-2',
            severity: 'P3',
            title: 'Generic observation',
            status: 'open',
          },
        ],
        userInterventions: [
          'plan:approved by conformance',
          'external-action:approved by conformance',
        ],
        authorizedExternalActions: ['commit'],
        endedAt: NOW,
      });
      expect(report).not.toHaveProperty('firstIncompleteStage');
      expect(JSON.stringify(report)).not.toContain(secret);
      expect(report.artifactHashes['run.json']).toMatch(/^[a-f0-9]{64}$/);
      expect(report.artifactHashes['request.md']).toMatch(/^[a-f0-9]{64}$/);

      const reportPath = await writeConformanceReport({
        report,
        outputDirectory: path.join(fixture.root, 'reports'),
      });
      await expect(readFile(reportPath, 'utf8')).resolves.toContain('"adapterId": "codex"');
    } finally {
      await fixture.cleanup();
    }
  });
});

describe('conformance report outcomes', () => {
  it('records blocked and failed outcomes with their first incomplete stage', async () => {
    const blocked = await createReportFixture('blocked');
    const failed = await createReportFixture('failed');

    try {
      await expect(
        buildConformanceReport({
          runId: blocked.run.id,
          runsRoot: blocked.runsRoot,
          scenario: getConformanceScenario('single-js-function'),
          failureMessage: 'Plan generation failed.',
        }),
      ).resolves.toMatchObject({
        outcome: 'blocked',
        firstIncompleteStage: 'blocked',
        changedPaths: [],
        verification: [],
        reviewFindings: [],
        failureMessage: 'Plan generation failed.',
      });
      await expect(
        buildConformanceReport({
          runId: failed.run.id,
          runsRoot: failed.runsRoot,
          scenario: getConformanceScenario('multi-package-js-export'),
        }),
      ).resolves.toMatchObject({
        outcome: 'failed',
        firstIncompleteStage: 'failed',
      });
    } finally {
      await blocked.cleanup();
      await failed.cleanup();
    }
  });

  it('rejects modified artifacts', async () => {
    const fixture = await createReportFixture('completed');

    try {
      const runDirectory = path.join(fixture.root, '.bossflow', 'runs', fixture.run.id);
      await writeFile(path.join(runDirectory, 'request.md'), 'modified\n', 'utf8');
      await expect(
        buildConformanceReport({
          runId: fixture.run.id,
          runsRoot: fixture.runsRoot,
          scenario: getConformanceScenario('single-js-export'),
        }),
      ).rejects.toThrow('has been modified');
    } finally {
      await fixture.cleanup();
    }
  });

  it('supports legacy runs without optional approvals or artifacts', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'bossflow-conformance-legacy-'));
    const runsRoot = path.join(root, '.bossflow', 'runs');
    const runId = 'run-legacy';
    const runDirectory = path.join(runsRoot, runId);
    await mkdir(runDirectory, { recursive: true });
    await writeFile(
      path.join(runDirectory, 'run.json'),
      JSON.stringify({
        schemaVersion: 1,
        id: runId,
        repositoryPath: root,
        goal: 'Legacy conformance run',
        modelProfile: 'deepseek',
        stage: 'failed',
        workflowRevision: 1,
        createdAt: NOW,
        updatedAt: NOW,
      }),
      'utf8',
    );

    try {
      await expect(
        buildConformanceReport({
          runId,
          runsRoot,
          scenario: getConformanceScenario('single-js-export'),
        }),
      ).resolves.toMatchObject({
        outcome: 'failed',
        firstIncompleteStage: 'failed',
        userInterventions: [],
        authorizedExternalActions: [],
        artifactHashes: { 'run.json': expect.stringMatching(/^[a-f0-9]{64}$/) },
        verification: [],
        reviewFindings: [],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function createReportFixture(stage: 'completed' | 'blocked' | 'failed') {
  const root = await mkdtemp(path.join(tmpdir(), 'bossflow-conformance-report-'));
  const runsRoot = path.join(root, '.bossflow', 'runs');
  const store = new FileRunStore({ runsRoot });
  let run = await store.create({
    repositoryPath: root,
    goal: 'Conformance report fixture',
    modelProfile: 'deepseek',
  });
  if (stage === 'completed') {
    await writeCompletedArtifacts(store, run);
  }
  run = await store.read(run.id);
  run = await store.save({
    ...run,
    stage,
    approvals: approvals(stage),
    artifacts: [...(run.artifacts ?? []), unhashedArtifact(root, run.id)],
    updatedAt: '2999-01-01T00:00:00.000Z',
  });
  return {
    root,
    runsRoot,
    run,
    cleanup: async () => {
      await rm(root, { recursive: true, force: true });
    },
  };
}

async function writeCompletedArtifacts(
  store: FileRunStore,
  run: Parameters<FileRunStore['writeJson']>[0],
) {
  await store.writeJson(run, 'implementation.json', {
    schemaVersion: 1,
    runId: run.id,
    result: {
      schemaVersion: 1,
      status: 'completed',
      summary: 'Implemented.',
      changedPaths: ['src/index.js'],
      testChanges: [],
      notes: [],
    },
    baseCommit: 'a'.repeat(40),
    changedPaths: ['src/index.js'],
    sensitivePaths: [],
    unexpectedPaths: [],
  });
  await store.writeJson(run, 'verification.json', {
    schemaVersion: 1,
    runId: run.id,
    status: 'passed',
    records: [
      {
        command: {
          id: 'test',
          label: 'Test',
          command: 'node',
          args: ['scripts/verify.mjs'],
          required: true,
          timeoutMs: 1_000,
        },
        result: {
          commandId: 'test',
          status: 'passed',
          exitCode: 0,
          startedAt: '2026-11-04T00:00:00.000Z',
          endedAt: '2026-11-04T00:00:00.100Z',
          durationMs: 100,
          stdout: 'passed',
          stderr: '',
          redacted: true,
        },
      },
      {
        command: {
          id: 'optional',
          label: 'Optional',
          command: 'node',
          args: ['optional-check.mjs'],
          required: false,
          timeoutMs: 1_000,
        },
        result: {
          commandId: 'optional',
          status: 'skipped',
          startedAt: '2026-11-04T00:00:00.000Z',
          endedAt: '2026-11-04T00:00:00.050Z',
          durationMs: 50,
          stdout: '',
          stderr: '',
          redacted: true,
        },
      },
    ],
    startedAt: '2026-11-04T00:00:00.000Z',
    endedAt: '2026-11-04T00:00:00.100Z',
  });
  await store.writeJson(run, 'review.json', {
    schemaVersion: 1,
    summary: 'Reviewed.',
    findings: [
      {
        id: 'finding-1',
        severity: 'P2',
        title: 'Review deepseek-super-secret-value',
        description: 'Non-blocking.',
        status: 'open',
        verificationCommandId: 'test',
      },
      {
        id: 'finding-2',
        severity: 'P3',
        title: 'Generic observation',
        description: 'No command association.',
        status: 'open',
      },
    ],
    requirementCoverage: [
      {
        requirementId: 'acceptance-1',
        criterion: 'Conformance fixture passes.',
        status: 'covered',
        evidence: ['test passed'],
      },
    ],
    unresolvedFindingIds: ['finding-1', 'finding-2'],
  });
}

function approvals(stage: 'completed' | 'blocked' | 'failed'): ApprovalRecord[] {
  if (stage !== 'completed') {
    return [];
  }
  return [
    {
      id: 'plan-approval',
      gate: 'plan',
      decision: 'approved',
      actor: 'conformance',
      decidedAt: NOW,
      workflowRevision: 1,
      artifactFileName: 'plan.json',
      artifactSha256: 'a'.repeat(64),
    },
    {
      id: 'external-action',
      gate: 'external-action',
      decision: 'approved',
      actor: 'conformance',
      decidedAt: NOW,
      workflowRevision: 1,
      actions: ['commit'],
    },
  ];
}

function unhashedArtifact(root: string, runId: string) {
  return {
    kind: 'other' as const,
    fileName: 'unhashed.txt',
    path: path.join(root, '.bossflow', 'runs', runId, 'unhashed.txt'),
    createdAt: NOW,
    attempt: 1,
  };
}
