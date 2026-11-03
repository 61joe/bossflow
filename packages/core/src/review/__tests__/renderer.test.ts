import { renderReview, renderSummary } from '../index.js';

describe('review renderers', () => {
  it('renders finding locations', () => {
    const markdown = renderReview({
      schemaVersion: 1,
      summary: 'Review summary',
      findings: [
        {
          id: 'p2',
          severity: 'P2',
          title: 'Finding',
          description: 'Description',
          status: 'open',
          file: 'src/index.ts',
          line: 10,
        },
      ],
      requirementCoverage: [
        {
          requirementId: 'criterion-1',
          criterion: 'Criterion',
          status: 'covered',
          evidence: ['evidence'],
        },
      ],
      unresolvedFindingIds: ['p2'],
    });

    expect(markdown).toContain('src/index.ts:10');
    expect(
      renderReview({
        schemaVersion: 1,
        summary: 'Review summary',
        findings: [
          {
            id: 'p3',
            severity: 'P3',
            title: 'Finding without line',
            description: 'Description',
            status: 'open',
            file: 'src/index.ts',
          },
        ],
        requirementCoverage: [
          {
            requirementId: 'criterion-1',
            criterion: 'Criterion',
            status: 'covered',
            evidence: ['evidence'],
          },
        ],
        unresolvedFindingIds: ['p3'],
      }),
    ).toContain('- Location: src/index.ts');
  });

  it('renders remaining risks and an empty pending-action list', () => {
    const markdown = renderSummary({
      schemaVersion: 1,
      runId: 'run-1',
      status: 'completed',
      completedWork: ['Work'],
      verification: [],
      reviewFindings: [],
      remainingRisks: ['Risk'],
      pendingActions: [],
    });

    expect(markdown).toContain('- Risk');
    expect(markdown).toContain('- None.');
    expect(
      renderSummary({
        schemaVersion: 1,
        runId: 'run-2',
        status: 'completed',
        completedWork: [],
        verification: [],
        reviewFindings: [],
        remainingRisks: [],
        pendingActions: ['Approve'],
      }),
    ).toContain('- None recorded.');
  });
});
