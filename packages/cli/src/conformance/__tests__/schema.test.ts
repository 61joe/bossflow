import { ConformanceReportSchema } from '../index.js';

const REPORT = {
  schemaVersion: 1,
  adapterId: 'codex',
  scenarioId: 'single-js-export',
  projectProfile: {
    id: 'single-package-javascript',
    packageManager: 'pnpm',
    languages: ['JavaScript'],
  },
  runId: 'run-1',
  stage: 'completed',
  outcome: 'completed',
  changedPaths: ['src/index.js'],
  verification: [{ commandId: 'test', status: 'passed', exitCode: 0 }],
  reviewFindings: [],
  userInterventions: ['plan:approved by conformance'],
  authorizedExternalActions: [],
  artifactHashes: {
    'run.json': 'a'.repeat(64),
  },
  startedAt: '2026-11-04T00:00:00.000Z',
  endedAt: '2026-11-04T00:01:00.000Z',
} as const;

describe('ConformanceReportSchema', () => {
  it('accepts completed, blocked, and failed report shapes', () => {
    expect(ConformanceReportSchema.parse(REPORT)).toEqual(REPORT);
    expect(
      ConformanceReportSchema.parse({
        ...REPORT,
        stage: 'blocked',
        outcome: 'blocked',
        firstIncompleteStage: 'review',
        failureMessage: 'Review blocked.',
      }),
    ).toMatchObject({ outcome: 'blocked', firstIncompleteStage: 'review' });
    expect(
      ConformanceReportSchema.parse({
        ...REPORT,
        stage: 'failed',
        outcome: 'failed',
        firstIncompleteStage: 'verify',
      }),
    ).toMatchObject({ outcome: 'failed', firstIncompleteStage: 'verify' });
  });

  it('rejects invalid hashes and unexpected fields', () => {
    expect(() =>
      ConformanceReportSchema.parse({
        ...REPORT,
        artifactHashes: { 'run.json': 'not-a-hash' },
      }),
    ).toThrow();
    expect(() =>
      ConformanceReportSchema.parse({
        ...REPORT,
        rawPrompt: 'must not be persisted',
      }),
    ).toThrow();
  });
});
