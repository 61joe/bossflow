import { rm } from 'node:fs/promises';

import type {
  ConformanceFixtureCleanupResult,
  FinalizeConformanceFixtureOptions,
} from './types.js';

export async function finalizeConformanceFixture(
  options: FinalizeConformanceFixtureOptions,
): Promise<ConformanceFixtureCleanupResult> {
  await rm(options.credentialsPath, { force: true });
  const retained = options.outcome !== 'completed' && options.keepOnFailure;
  if (!retained) {
    await rm(options.fixtureRoot, { recursive: true, force: true });
    await rm(options.worktreesRoot, { recursive: true, force: true });
  }
  return { retained };
}
