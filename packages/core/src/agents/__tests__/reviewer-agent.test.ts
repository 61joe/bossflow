import { jest } from '@jest/globals';

import { createRuntime, REVIEWER_INPUT } from './support/agent-fixtures.js';
import type { ReviewFinding, ReviewResult } from '../../contracts/index.js';

jest.unstable_mockModule('@openai/agents', async () => {
  const mock = await import('./support/agent-runtime-mock.js');
  return {
    Agent: mock.MockAgent,
    Runner: mock.MockRunner,
  };
});

const runtimeMock = await import('./support/agent-runtime-mock.js');
const { generateReviewResult, hasBlockingReviewFindings } = await import('../index.js');

const reviewResult: ReviewResult = {
  schemaVersion: 1,
  summary: 'The implementation has one blocking finding.',
  findings: [
    {
      id: 'finding-1',
      severity: 'P1',
      title: 'Missing gate',
      description: 'Build can start without approval.',
      status: 'open',
    },
  ],
  requirementCoverage: [
    {
      requirementId: 'workflow-runs:plan-approval',
      criterion: 'Build requires approval.',
      status: 'missing',
      evidence: [],
    },
  ],
  unresolvedFindingIds: ['finding-1'],
};

const finding: ReviewFinding = {
  id: 'finding-1',
  severity: 'P1',
  title: 'Missing gate',
  description: 'Build can start without approval.',
  status: 'open',
};

describe('reviewer agent', () => {
  beforeEach(() => {
    runtimeMock.resetAgentRuntimeMock();
  });

  it('generates structured review output with verification evidence', async () => {
    runtimeMock.queueOutputs(reviewResult);

    await expect(generateReviewResult(REVIEWER_INPUT)).resolves.toEqual(reviewResult);
    expect(runtimeMock.runCalls[0]?.input).toContain('93 tests passed');
  });

  it('supports compatible-provider JSON output', async () => {
    runtimeMock.queueOutputs(JSON.stringify(reviewResult));

    await expect(
      generateReviewResult(REVIEWER_INPUT, {
        modelRuntime: createRuntime('prompt-json'),
      }),
    ).resolves.toEqual(reviewResult);
    expect(runtimeMock.agentConfigs[0]).not.toHaveProperty('outputType');
  });

  it('rejects unredacted verification evidence before model execution', async () => {
    await expect(
      generateReviewResult({
        ...REVIEWER_INPUT,
        verificationEvidence: [
          {
            ...REVIEWER_INPUT.verificationEvidence[0]!,
            redacted: false,
          },
        ],
      }),
    ).rejects.toThrow('must be redacted');
    expect(runtimeMock.runCalls).toHaveLength(0);
  });

  it('redacts secrets from the complete review payload', async () => {
    runtimeMock.queueOutputs(reviewResult);
    const secret = 'sk-super-secret-token';

    await generateReviewResult({
      ...REVIEWER_INPUT,
      diff: `+const apiKey = "${secret}";`,
    });

    expect(runtimeMock.runCalls[0]?.input).not.toContain(secret);
    expect(runtimeMock.runCalls[0]?.input).toContain('[REDACTED]');
  });

  it('blocks unresolved P0 and P1 findings', () => {
    expect(hasBlockingReviewFindings(reviewResult)).toBe(true);
    expect(
      hasBlockingReviewFindings({
        ...reviewResult,
        findings: [
          {
            ...finding,
            id: 'finding-p0',
            severity: 'P0',
          },
        ],
        unresolvedFindingIds: ['finding-p0'],
      }),
    ).toBe(true);
  });

  it('does not block lower-severity findings or resolved findings', () => {
    expect(
      hasBlockingReviewFindings({
        ...reviewResult,
        findings: [
          {
            ...finding,
            id: 'finding-p2',
            severity: 'P2',
          },
        ],
        unresolvedFindingIds: ['finding-p2'],
      }),
    ).toBe(false);
    expect(
      hasBlockingReviewFindings({
        ...reviewResult,
        findings: [{ ...finding, status: 'resolved' }],
        unresolvedFindingIds: [],
      }),
    ).toBe(false);
  });
});
