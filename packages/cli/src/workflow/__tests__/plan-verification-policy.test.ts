import type { ProjectProfile, TechnicalPlan } from '@bossflow/core';

import { adoptPlanVerificationCommands, sameVerificationIds } from '../plan-verification-policy.js';

const BASE = {
  id: 'test',
  label: 'Test',
  command: 'pnpm',
  args: ['test'],
  required: true,
  timeoutMs: 1_000,
} as const;
const BROWSER = {
  id: 'browser',
  label: 'Browser',
  command: 'pnpm',
  args: ['test:browser'],
  required: true,
  timeoutMs: 2_000,
} as const;
const PLAN: TechnicalPlan = {
  schemaVersion: 1,
  summary: 'Adopt commands.',
  affectedPaths: ['src'],
  tasks: [
    {
      id: 'task-1',
      title: 'Implement',
      description: 'Implement.',
      dependencies: [],
      affectedPaths: ['src'],
      acceptanceCriteria: ['Works.'],
    },
  ],
  interfaceChanges: [],
  risks: [],
  verificationCommands: [BASE, BROWSER],
};

describe('plan verification policy', () => {
  it('appends only selected commands and preserves existing commands', () => {
    expect(adoptPlanVerificationCommands(profile(), PLAN, ['browser'])).toEqual({
      commandIds: ['browser'],
      commands: [BROWSER],
      projectProfile: expect.objectContaining({
        verificationCommands: [BASE, BROWSER],
      }),
    });
    expect(adoptPlanVerificationCommands(profile(), PLAN, ['test'])).toMatchObject({
      projectProfile: { verificationCommands: [BASE] },
    });
  });

  it.each([
    {
      name: 'missing profile',
      profile: undefined,
      plan: PLAN,
      ids: ['browser'],
      message: 'without a persisted project profile',
    },
    {
      name: 'duplicate selection',
      profile: profile(),
      plan: PLAN,
      ids: ['browser', 'browser'],
      message: 'must be unique',
    },
    {
      name: 'duplicate Plan ID',
      profile: profile(),
      plan: { ...PLAN, verificationCommands: [BROWSER, BROWSER] },
      ids: ['browser'],
      message: 'duplicate verification command ID',
    },
    {
      name: 'unknown command',
      profile: profile(),
      plan: PLAN,
      ids: ['unknown'],
      message: 'does not contain',
    },
    {
      name: 'conflicting command',
      profile: profile(),
      plan: {
        ...PLAN,
        verificationCommands: [{ ...BASE, args: ['different'] }],
      },
      ids: ['test'],
      message: 'conflicts',
    },
  ])('rejects $name', ({ profile: selectedProfile, plan, ids, message }) => {
    expect(() => adoptPlanVerificationCommands(selectedProfile, plan, ids)).toThrow(message);
  });

  it('compares verification IDs without order sensitivity', () => {
    expect(sameVerificationIds(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(sameVerificationIds(['a'], ['a', 'b'])).toBe(false);
  });
});

function profile(): ProjectProfile {
  return {
    schemaVersion: 1,
    repositoryRoot: '/tmp/project',
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
    verificationCommands: [BASE],
    ambiguities: [],
    requiresConfirmation: false,
    confirmedByUser: true,
  };
}
