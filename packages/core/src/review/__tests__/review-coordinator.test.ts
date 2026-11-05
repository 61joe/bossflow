/* eslint-disable max-lines, max-lines-per-function, complexity -- Review scenarios share one artifact fixture with many optional branches. */
import { jest } from '@jest/globals';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type {
  ApprovalRecord,
  ReviewResult,
  TechnicalPlan,
  VerificationCommand,
  VerificationResult,
} from '../../contracts/index.js';
import type { DevelopmentSpecification, ReviewerAgentInput } from '../../agents/index.js';
import type { ProjectProfile } from '../../project-context/index.js';
import { FileRunStore } from '../../run-store/index.js';
import type { RunStore } from '../../run-store/index.js';
import { VerificationReportSchema } from '../../verification/index.js';
import { MAX_REVIEW_DIFF_BYTES, ReviewCoordinator } from '../index.js';

const NOW = '2026-11-03T00:00:00.000Z';
const SPECIFICATION: DevelopmentSpecification = {
  title: 'Review implementation',
  problem: 'The implementation needs evidence.',
  scope: ['Review evidence'],
  nonGoals: [],
  acceptanceCriteria: ['Tests pass.'],
  constraints: [],
};
const PLAN: TechnicalPlan = {
  schemaVersion: 1,
  summary: 'Implement and review.',
  affectedPaths: ['src'],
  tasks: [
    {
      id: 'task-1',
      title: 'Implement source',
      description: 'Change source.',
      dependencies: [],
      affectedPaths: ['src'],
      acceptanceCriteria: ['Tests pass.'],
    },
  ],
  interfaceChanges: [],
  risks: [
    {
      description: 'Implementation may regress behavior.',
      severity: 'medium',
      mitigation: 'Run all required verification commands.',
    },
  ],
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
const VERIFICATION: VerificationResult = {
  commandId: 'test',
  status: 'passed',
  exitCode: 0,
  startedAt: NOW,
  endedAt: NOW,
  durationMs: 0,
  stdout: 'passed',
  stderr: '',
  redacted: true,
};
const ADVISORY_COMMAND: VerificationCommand = {
  id: 'diff-check',
  label: 'Diff check',
  command: 'git',
  args: ['diff', '--check'],
  required: true,
  timeoutMs: 1_000,
};
const REQUIRED_BUILD_COMMAND: VerificationCommand = {
  id: 'build',
  label: 'Build',
  command: 'pnpm',
  args: ['build'],
  required: true,
  timeoutMs: 1_000,
};
const REVIEW: ReviewResult = {
  schemaVersion: 1,
  summary: 'Implementation is ready.',
  findings: [],
  requirementCoverage: [
    {
      requirementId: 'acceptance-1',
      criterion: 'Tests pass.',
      status: 'covered',
      evidence: ['test passed'],
    },
  ],
  unresolvedFindingIds: [],
};

describe('ReviewCoordinator', () => {
  it('persists review and summary, then waits at review approval', async () => {
    const fixture = await reviewRun();
    let reviewerInput: ReviewerAgentInput | undefined;
    const coordinator = new ReviewCoordinator({
      store: fixture.store,
      reviewer: async (input) => {
        reviewerInput = input;
        return REVIEW;
      },
      now: () => new Date(NOW),
    });

    try {
      const outcome = await coordinator.review({ runId: fixture.run.id });
      expect(outcome).toMatchObject({
        status: 'ready-for-approval',
        run: { stage: 'review_approval' },
        summary: { status: 'completed' },
      });
      const runDirectory = path.join(fixture.runsRoot, fixture.run.id);
      await expect(readFile(path.join(runDirectory, 'review.json'), 'utf8')).resolves.toContain(
        '"status": "covered"',
      );
      await expect(readFile(path.join(runDirectory, 'review.md'), 'utf8')).resolves.toContain(
        '# Review',
      );
      await expect(readFile(path.join(runDirectory, 'summary.md'), 'utf8')).resolves.toContain(
        'Pending Actions',
      );
      await expect(coordinator.review({ runId: fixture.run.id })).resolves.toMatchObject({
        status: 'already-completed',
      });
      expect(reviewerInput?.verificationContext).toEqual({
        authoritativeCommands: PLAN.verificationCommands,
        executedCommandIds: ['test'],
        advisoryPlanCommands: [],
        missingRequiredCommandIds: [],
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it('blocks unresolved high-severity findings', async () => {
    const fixture = await reviewRun();
    const coordinator = new ReviewCoordinator({
      store: fixture.store,
      reviewer: async () => ({
        ...REVIEW,
        findings: [
          {
            id: 'p1',
            severity: 'P1',
            title: 'Missing behavior',
            description: 'Behavior is missing.',
            status: 'open',
          },
        ],
        unresolvedFindingIds: ['p1'],
      }),
    });

    try {
      await expect(coordinator.review({ runId: fixture.run.id })).resolves.toMatchObject({
        status: 'blocked',
        run: { stage: 'blocked' },
        summary: { status: 'blocked' },
      });
      await expect(coordinator.review({ runId: fixture.run.id })).resolves.toMatchObject({
        status: 'already-completed',
        run: { stage: 'blocked' },
      });
    } finally {
      await fixture.cleanup();
    }
  });
});

describe('ReviewCoordinator verification authority', () => {
  it('passes advisory plan commands without treating them as required evidence', async () => {
    const fixture = await reviewRun({
      profileVerificationCommands: [PLAN.verificationCommands[0]!],
      planVerificationCommands: [PLAN.verificationCommands[0]!, ADVISORY_COMMAND],
      recordedVerificationCommands: [PLAN.verificationCommands[0]!],
    });
    const coordinator = new ReviewCoordinator({
      store: fixture.store,
      reviewer: async (input) => {
        expect(input.verificationContext).toEqual({
          authoritativeCommands: [PLAN.verificationCommands[0]!],
          executedCommandIds: ['test'],
          advisoryPlanCommands: [ADVISORY_COMMAND],
          missingRequiredCommandIds: [],
        });
        return {
          ...REVIEW,
          findings: [
            {
              id: 'advisory-only',
              severity: 'P1',
              title: 'Advisory check is missing',
              description: 'The advisory check did not execute.',
              status: 'open',
              verificationCommandId: 'diff-check',
            },
          ],
          unresolvedFindingIds: ['advisory-only'],
        };
      },
    });

    try {
      await expect(coordinator.review({ runId: fixture.run.id })).resolves.toMatchObject({
        status: 'ready-for-approval',
        review: {
          findings: [
            expect.objectContaining({
              id: 'advisory-only',
              severity: 'P3',
            }),
          ],
        },
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it('adds a blocking finding when required authoritative evidence is missing', async () => {
    const fixture = await reviewRun({
      profileVerificationCommands: [PLAN.verificationCommands[0]!, REQUIRED_BUILD_COMMAND],
      planVerificationCommands: [PLAN.verificationCommands[0]!, REQUIRED_BUILD_COMMAND],
      recordedVerificationCommands: [PLAN.verificationCommands[0]!],
    });
    const coordinator = new ReviewCoordinator({
      store: fixture.store,
      reviewer: async (input) => {
        expect(input.verificationContext).toEqual({
          authoritativeCommands: [PLAN.verificationCommands[0]!, REQUIRED_BUILD_COMMAND],
          executedCommandIds: ['test'],
          advisoryPlanCommands: [],
          missingRequiredCommandIds: ['build'],
        });
        return REVIEW;
      },
    });

    try {
      const outcome = await coordinator.review({ runId: fixture.run.id });
      expect(outcome.status).toBe('blocked');
      if (outcome.status === 'blocked') {
        expect(outcome.review.findings).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              severity: 'P1',
              title: 'Required verification evidence is missing',
              description: expect.stringContaining('"build"'),
            }),
          ]),
        );
      }
    } finally {
      await fixture.cleanup();
    }
  });
});

describe('ReviewCoordinator coverage', () => {
  it('adds a blocking finding for an unmapped acceptance criterion', async () => {
    const fixture = await reviewRun();
    const coordinator = new ReviewCoordinator({
      store: fixture.store,
      reviewer: async () => ({
        ...REVIEW,
        requirementCoverage: [
          {
            requirementId: 'unrelated',
            criterion: 'Unrelated criterion',
            status: 'covered',
            evidence: ['unrelated evidence'],
          },
        ],
      }),
    });

    try {
      const outcome = await coordinator.review({ runId: fixture.run.id });
      expect(outcome.status).toBe('blocked');
      if (outcome.status === 'blocked') {
        expect(outcome.review.findings).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              severity: 'P1',
              title: 'Acceptance criterion is not mapped',
            }),
          ]),
        );
      }
    } finally {
      await fixture.cleanup();
    }
  });

  it('allocates a unique coverage finding ID', async () => {
    const fixture = await reviewRun();
    const coordinator = new ReviewCoordinator({
      store: fixture.store,
      reviewer: async () => ({
        ...REVIEW,
        findings: [
          {
            id: 'missing-coverage-1',
            severity: 'P3',
            title: 'Existing finding',
            description: 'Existing.',
            status: 'resolved',
          },
        ],
        requirementCoverage: [
          {
            requirementId: 'unrelated',
            criterion: 'Other',
            status: 'covered',
            evidence: ['evidence'],
          },
        ],
      }),
    });

    try {
      const outcome = await coordinator.review({ runId: fixture.run.id });
      if (outcome.status !== 'blocked') {
        throw new Error('Expected coverage blocker.');
      }
      expect(outcome.review.findings.map((finding) => finding.id)).toContain('missing-coverage-2');
    } finally {
      await fixture.cleanup();
    }
  });

  it('redacts secrets from persisted review and summary', async () => {
    const fixture = await reviewRun();
    const secret = 'sk-super-secret-token';
    const coordinator = new ReviewCoordinator({
      store: fixture.store,
      reviewer: async () => ({
        ...REVIEW,
        summary: `Review ${secret}`,
        findings: [
          {
            id: 'resolved-secret',
            severity: 'P3',
            title: 'Resolved finding',
            description: `Resolved ${secret}`,
            status: 'resolved',
          },
        ],
      }),
    });

    try {
      await coordinator.review({ runId: fixture.run.id });
      const runDirectory = path.join(fixture.runsRoot, fixture.run.id);
      const reviewContent = await readFile(path.join(runDirectory, 'review.json'), 'utf8');
      const summaryContent = await readFile(path.join(runDirectory, 'summary.json'), 'utf8');
      expect(reviewContent).not.toContain(secret);
      expect(summaryContent).not.toContain(secret);
      expect(reviewContent).toContain('[REDACTED]');
    } finally {
      await fixture.cleanup();
    }
  });
});

describe('ReviewCoordinator incomplete coverage', () => {
  it('blocks partial acceptance coverage even without a reviewer finding', async () => {
    const fixture = await reviewRun();
    const coordinator = new ReviewCoordinator({
      store: fixture.store,
      reviewer: async () => ({
        ...REVIEW,
        requirementCoverage: [
          {
            requirementId: 'acceptance-1',
            criterion: 'Tests pass.',
            status: 'partial',
            evidence: ['Only one test path is covered.'],
          },
        ],
      }),
    });

    try {
      const outcome = await coordinator.review({ runId: fixture.run.id });
      expect(outcome.status).toBe('blocked');
      if (outcome.status === 'blocked') {
        expect(outcome.review.findings).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              severity: 'P1',
              title: 'Acceptance criterion is not fully covered',
            }),
          ]),
        );
      }
    } finally {
      await fixture.cleanup();
    }
  });
});

describe('ReviewCoordinator recovery', () => {
  it('ignores superseded Review and Summary evidence during a retry attempt', async () => {
    const fixture = await reviewRun();
    const reviewer = jest.fn(async () => REVIEW);
    const coordinator = new ReviewCoordinator({
      store: fixture.store,
      reviewer,
    });

    try {
      await coordinator.review({ runId: fixture.run.id });
      const completed = await fixture.store.read(fixture.run.id);
      const retry = await fixture.store.save({
        ...completed,
        stage: 'review',
        attempt: 2,
        updatedAt: new Date(Date.parse(completed.updatedAt) + 1_000).toISOString(),
      });
      await fixture.store.archiveArtifacts(
        retry.id,
        ['review.json', 'review.md', 'summary.json', 'summary.md'],
        new Date(Date.parse(retry.updatedAt) + 1_000).toISOString(),
      );

      await expect(coordinator.review({ runId: fixture.run.id })).resolves.toMatchObject({
        status: 'ready-for-approval',
      });
      expect(reviewer).toHaveBeenCalledTimes(2);
    } finally {
      await fixture.cleanup();
    }
  });

  it('rejects modified, missing, or invalid review inputs', async () => {
    const fixture = await reviewRun();
    const coordinator = new ReviewCoordinator({
      store: fixture.store,
      reviewer: async () => REVIEW,
    });

    try {
      const specPath = path.join(fixture.runsRoot, fixture.run.id, 'spec.json');
      const content = await readFile(specPath, 'utf8');
      await writeFile(specPath, `${content} `, 'utf8');
      await expect(coordinator.review({ runId: fixture.run.id })).rejects.toThrow(
        'has been modified',
      );
    } finally {
      await fixture.cleanup();
    }

    const failedVerification = await reviewRun({ verificationStatus: 'failed' });
    try {
      await expect(
        new ReviewCoordinator({
          store: failedVerification.store,
          reviewer: async () => REVIEW,
        }).review({ runId: failedVerification.run.id }),
      ).rejects.toThrow('failed verification report');
    } finally {
      await failedVerification.cleanup();
    }

    const wrongStage = await reviewRun({ stage: 'verify' });
    try {
      await expect(
        new ReviewCoordinator({
          store: wrongStage.store,
          reviewer: async () => REVIEW,
        }).review({ runId: wrongStage.run.id }),
      ).rejects.toThrow('requires the review stage');
    } finally {
      await wrongStage.cleanup();
    }
  });

  it('recovers a persisted review after a transition failure', async () => {
    const fixture = await reviewRun();
    jest.spyOn(fixture.store, 'transition').mockResolvedValueOnce({
      ok: false,
      from: 'review',
      to: 'review_approval',
      reason: 'transition failed',
    });
    const coordinator = new ReviewCoordinator({
      store: fixture.store,
      reviewer: async () => REVIEW,
    });

    try {
      await expect(coordinator.review({ runId: fixture.run.id })).rejects.toThrow(
        'transition failed',
      );
      jest.restoreAllMocks();
      jest.spyOn(fixture.store, 'transition').mockResolvedValueOnce({
        ok: false,
        from: 'review',
        to: 'review_approval',
        reason: 'recovery transition failed',
      });
      await expect(coordinator.review({ runId: fixture.run.id })).rejects.toThrow(
        'recovery transition failed',
      );
      jest.restoreAllMocks();
      await expect(coordinator.review({ runId: fixture.run.id })).resolves.toMatchObject({
        status: 'already-completed',
        run: { stage: 'review_approval' },
      });
    } finally {
      jest.restoreAllMocks();
      await fixture.cleanup();
    }
  });

  it('rejects a modified review artifact', async () => {
    const fixture = await reviewRun();
    const coordinator = new ReviewCoordinator({
      store: fixture.store,
      reviewer: async () => REVIEW,
    });

    try {
      await coordinator.review({ runId: fixture.run.id });
      const reviewPath = path.join(fixture.runsRoot, fixture.run.id, 'review.json');
      const content = await readFile(reviewPath, 'utf8');
      await writeFile(reviewPath, `${content} `, 'utf8');
      await expect(coordinator.review({ runId: fixture.run.id })).rejects.toThrow(
        'has been modified',
      );
    } finally {
      await fixture.cleanup();
    }
  });
});

describe('ReviewCoordinator summary recovery', () => {
  it('rebuilds a missing summary before completing review recovery', async () => {
    const fixture = await reviewRun();
    const coordinator = new ReviewCoordinator({
      store: fixture.store,
      reviewer: async () => REVIEW,
    });

    try {
      await coordinator.review({ runId: fixture.run.id });
      const current = await fixture.store.read(fixture.run.id);
      const runDirectory = path.join(fixture.runsRoot, fixture.run.id);
      await rm(path.join(runDirectory, 'summary.json'), { force: true });
      await rm(path.join(runDirectory, 'summary.md'), { force: true });
      await fixture.store.save({
        ...current,
        stage: 'review',
        artifacts: current.artifacts?.filter(
          (artifact) => artifact.fileName !== 'summary.json' && artifact.fileName !== 'summary.md',
        ),
        updatedAt: '2999-01-02T00:00:00.000Z',
      });

      const recovered = await coordinator.review({ runId: fixture.run.id });
      expect(recovered).toMatchObject({
        status: 'already-completed',
        run: { stage: 'review_approval' },
        summary: { runId: fixture.run.id, status: 'completed' },
      });
      await expect(readFile(path.join(runDirectory, 'summary.json'), 'utf8')).resolves.toContain(
        '"status": "completed"',
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it('repairs a summary that no longer matches review inputs', async () => {
    const fixture = await reviewRun();
    const coordinator = new ReviewCoordinator({
      store: fixture.store,
      reviewer: async () => REVIEW,
    });

    try {
      await coordinator.review({ runId: fixture.run.id });
      const current = await fixture.store.read(fixture.run.id);
      const summaryPath = path.join(fixture.runsRoot, fixture.run.id, 'summary.json');
      const staleSummary = JSON.parse(await readFile(summaryPath, 'utf8'));
      await fixture.store.writeJson(current, 'summary.json', {
        ...staleSummary,
        completedWork: [],
      });
      await fixture.store.writeMarkdown(current, 'summary.md', '# Stale Summary\n');

      const recovered = await coordinator.review({ runId: fixture.run.id });
      expect(recovered).toMatchObject({
        status: 'already-completed',
        run: { stage: 'review_approval' },
        summary: { completedWork: ['Implement source'] },
      });
      await expect(readFile(summaryPath, 'utf8')).resolves.toContain('Implement source');
    } finally {
      await fixture.cleanup();
    }
  });
});

describe('ReviewCoordinator validation', () => {
  it('rejects inconsistent recovery states and missing approvals', async () => {
    const inconsistent = await reviewRun();
    try {
      const coordinator = new ReviewCoordinator({
        store: inconsistent.store,
        reviewer: async () => REVIEW,
      });
      await coordinator.review({ runId: inconsistent.run.id });
      const current = await inconsistent.store.read(inconsistent.run.id);
      await inconsistent.store.save({
        ...current,
        stage: 'verify',
        updatedAt: '2999-01-02T00:00:00.000Z',
      });
      await expect(coordinator.review({ runId: inconsistent.run.id })).rejects.toThrow(
        'cannot recover stage',
      );
    } finally {
      await inconsistent.cleanup();
    }

    const noApproval = await reviewRun();
    try {
      await noApproval.store.save({
        ...noApproval.run,
        approvals: [],
        updatedAt: '2999-01-02T00:00:00.000Z',
      });
      await expect(
        new ReviewCoordinator({
          store: noApproval.store,
          reviewer: async () => REVIEW,
        }).review({ runId: noApproval.run.id }),
      ).rejects.toThrow('no matching plan approval');
    } finally {
      await noApproval.cleanup();
    }

    const legacyNoApproval = await reviewRun();
    try {
      const store = {
        read: async () => ({
          ...legacyNoApproval.run,
          approvals: undefined,
        }),
        readText: async (_run: unknown, fileName: string) =>
          legacyNoApproval.store.readText(legacyNoApproval.run, fileName),
      } as unknown as RunStore;
      await expect(
        new ReviewCoordinator({
          store,
          reviewer: async () => REVIEW,
        }).review({ runId: legacyNoApproval.run.id }),
      ).rejects.toThrow('no matching plan approval');
    } finally {
      await legacyNoApproval.cleanup();
    }
  });
});

describe('ReviewCoordinator artifact edge cases', () => {
  it('supports a missing optional patch and rejects a missing required spec', async () => {
    const noPatch = await reviewRun({ withPatch: false });
    try {
      await expect(
        new ReviewCoordinator({
          store: noPatch.store,
          reviewer: async (input) => {
            expect(input.diff).toBe('');
            return REVIEW;
          },
        }).review({ runId: noPatch.run.id }),
      ).resolves.toMatchObject({ status: 'ready-for-approval' });
    } finally {
      await noPatch.cleanup();
    }

    const noSpec = await reviewRun();
    try {
      const current = await noSpec.store.read(noSpec.run.id);
      await noSpec.store.save({
        ...current,
        artifacts: current.artifacts?.filter((artifact) => artifact.fileName !== 'spec.json'),
        updatedAt: '2999-01-02T00:00:00.000Z',
      });
      await expect(
        new ReviewCoordinator({
          store: noSpec.store,
          reviewer: async () => REVIEW,
        }).review({ runId: noSpec.run.id }),
      ).rejects.toThrow('has no artifact "spec.json"');
    } finally {
      await noSpec.cleanup();
    }
  });

  it('bounds the diff evidence supplied to the reviewer', async () => {
    const changedFiles = Array.from(
      { length: 21 },
      (_, index) => `diff --git a/src/file-${index}.ts b/src/file-${index}.ts`,
    ).join('\n');
    const largePatch = `${changedFiles}\n${'+x'.repeat(MAX_REVIEW_DIFF_BYTES)}\n`;
    const largeDiff = await reviewRun({ patch: largePatch });
    try {
      const outcome = await new ReviewCoordinator({
        store: largeDiff.store,
        reviewer: async (input) => {
          expect(input.diff).toContain('[DIFF SUMMARY]');
          expect(input.diff).toContain('[DIFF_TRUNCATED]');
          expect(input.diff).toContain('additional paths omitted');
          expect(Buffer.byteLength(input.diff)).toBeLessThanOrEqual(MAX_REVIEW_DIFF_BYTES);
          expect(input.diff).not.toBe(largePatch);
          return REVIEW;
        },
      }).review({ runId: largeDiff.run.id });
      expect(outcome.status).toBe('ready-for-approval');
    } finally {
      await largeDiff.cleanup();
    }
  });
});

async function reviewRun(
  options: {
    readonly verificationStatus?: 'passed' | 'failed';
    readonly stage?: 'review' | 'verify';
    readonly withPatch?: boolean;
    readonly patch?: string;
    readonly profileVerificationCommands?: readonly VerificationCommand[];
    readonly planVerificationCommands?: readonly VerificationCommand[];
    readonly recordedVerificationCommands?: readonly VerificationCommand[];
  } = {},
) {
  const runsRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-review-'));
  const repositoryPath = await mkdtemp(path.join(tmpdir(), 'bossflow-review-repo-'));
  const store = new FileRunStore({ runsRoot });
  let run = await store.create({
    repositoryPath,
    goal: 'Review implementation',
    modelProfile: 'openai',
    ...projectProfileOption(repositoryPath, options.profileVerificationCommands),
  });
  const plan: TechnicalPlan = {
    ...PLAN,
    verificationCommands: options.planVerificationCommands ?? PLAN.verificationCommands,
  };
  const recordedCommands =
    options.recordedVerificationCommands ??
    options.profileVerificationCommands ??
    plan.verificationCommands;
  await store.writeJson(run, 'spec.json', SPECIFICATION);
  await store.writeJson(run, 'plan.json', plan);
  if (options.withPatch !== false) {
    await store.writeMarkdown(
      run,
      'implementation.patch',
      options.patch ?? 'diff --git a/src/index.ts b/src/index.ts\n',
    );
  }
  await store.writeJson(
    run,
    'verification.json',
    VerificationReportSchema.parse({
      schemaVersion: 1,
      runId: run.id,
      status: options.verificationStatus ?? 'passed',
      records: createVerificationRecords(options.verificationStatus ?? 'passed', recordedCommands),
      startedAt: NOW,
      endedAt: NOW,
    }),
  );
  run = await store.read(run.id);
  const planArtifact = run.artifacts?.find((artifact) => artifact.fileName === 'plan.json');
  if (planArtifact?.sha256 === undefined) {
    throw new Error('Expected plan artifact.');
  }
  const approval: ApprovalRecord = {
    id: 'approval-plan',
    gate: 'plan',
    decision: 'approved',
    actor: 'user',
    decidedAt: NOW,
    workflowRevision: 1,
    artifactFileName: planArtifact.fileName,
    artifactSha256: planArtifact.sha256,
  };
  run = await store.save({
    ...run,
    stage: options.stage ?? 'review',
    worktree: {
      path: path.join(repositoryPath, 'worktree'),
      branch: 'bossflow/run-review',
      baseCommit: 'a'.repeat(40),
      createdAt: NOW,
      status: 'active',
    },
    approvals: [approval],
    updatedAt: '2999-01-01T00:00:00.000Z',
  });
  return {
    runsRoot,
    store,
    run,
    cleanup: async () => {
      await rm(runsRoot, { recursive: true, force: true });
      await rm(repositoryPath, { recursive: true, force: true });
    },
  };
}

function projectProfileOption(
  repositoryRoot: string,
  verificationCommands: readonly VerificationCommand[] | undefined,
) {
  return verificationCommands === undefined
    ? {}
    : { projectProfile: createProjectProfile(repositoryRoot, verificationCommands) };
}

function createVerificationRecords(
  status: 'passed' | 'failed',
  commands: readonly VerificationCommand[],
) {
  return commands.map((command) => ({
    command,
    result:
      status === 'failed'
        ? { ...VERIFICATION, commandId: command.id, status, exitCode: 1 }
        : { ...VERIFICATION, commandId: command.id, status },
  }));
}

function createProjectProfile(
  repositoryRoot: string,
  verificationCommands: readonly VerificationCommand[],
): ProjectProfile {
  return {
    schemaVersion: 1,
    repositoryRoot,
    git: {
      isRepository: true,
      branch: 'main',
      status: 'clean',
      changedPaths: [],
    },
    packageManager: 'pnpm',
    languages: ['TypeScript'],
    frameworks: [],
    conventionFiles: [],
    planningContextFiles: [],
    testConfigFiles: [],
    packageScripts: {},
    verificationCommands,
    ambiguities: [],
    requiresConfirmation: false,
    confirmedByUser: true,
  };
}
