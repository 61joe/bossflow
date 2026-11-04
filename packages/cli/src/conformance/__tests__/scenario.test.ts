import { CONFORMANCE_SCENARIOS, getConformanceScenario } from '../index.js';

describe('conformance scenarios', () => {
  it('covers three tasks across two project profiles', () => {
    expect(CONFORMANCE_SCENARIOS).toHaveLength(3);
    expect(new Set(CONFORMANCE_SCENARIOS.map((scenario) => scenario.projectProfile)).size).toBe(2);
    expect(CONFORMANCE_SCENARIOS.map((scenario) => scenario.id)).toEqual([
      'single-js-export',
      'single-js-function',
      'multi-package-js-export',
    ]);
    for (const scenario of CONFORMANCE_SCENARIOS) {
      expect(scenario.files[scenario.expectedChangedPath]).toBeDefined();
      expect(scenario.files['package.json']).toContain('"test"');
    }
    expect(getConformanceScenario('multi-package-js-export').files['package.json']).toContain(
      'node --check packages/app/src/index.js',
    );
  });

  it('returns a known scenario and rejects unknown IDs', () => {
    expect(getConformanceScenario('single-js-export')).toMatchObject({
      id: 'single-js-export',
      packageManager: 'pnpm',
      languages: ['JavaScript'],
    });
    expect(() => getConformanceScenario('unknown' as never)).toThrow(
      'Unknown conformance scenario',
    );
  });
});
