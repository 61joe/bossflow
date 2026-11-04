import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { finalizeConformanceFixture } from '../index.js';

describe('finalizeConformanceFixture', () => {
  it('removes the fixture and credentials after success', async () => {
    const fixture = await createFixture();

    await expect(
      finalizeConformanceFixture({
        fixtureRoot: fixture.root,
        worktreesRoot: fixture.worktreesRoot,
        credentialsPath: fixture.credentialsPath,
        outcome: 'completed',
        keepOnFailure: true,
      }),
    ).resolves.toEqual({ retained: false });
    await expect(access(fixture.root)).rejects.toThrow();
    await expect(access(fixture.worktreesRoot)).rejects.toThrow();
  });

  it('removes failure fixtures unless retention is enabled', async () => {
    const fixture = await createFixture();

    await expect(
      finalizeConformanceFixture({
        fixtureRoot: fixture.root,
        worktreesRoot: fixture.worktreesRoot,
        credentialsPath: fixture.credentialsPath,
        outcome: 'blocked',
        keepOnFailure: false,
      }),
    ).resolves.toEqual({ retained: false });
    await expect(access(fixture.root)).rejects.toThrow();
    await expect(access(fixture.worktreesRoot)).rejects.toThrow();
  });

  it('retains a failed fixture only after removing credentials', async () => {
    const fixture = await createFixture();

    try {
      await expect(
        finalizeConformanceFixture({
          fixtureRoot: fixture.root,
          worktreesRoot: fixture.worktreesRoot,
          credentialsPath: fixture.credentialsPath,
          outcome: 'failed',
          keepOnFailure: true,
        }),
      ).resolves.toEqual({ retained: true });
      await expect(access(fixture.root)).resolves.toBeUndefined();
      await expect(access(fixture.worktreesRoot)).resolves.toBeUndefined();
      await expect(access(fixture.credentialsPath)).rejects.toThrow();
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
      await rm(fixture.worktreesRoot, { recursive: true, force: true });
    }
  });
});

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'bossflow-conformance-cleanup-'));
  const worktreesRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-conformance-worktrees-'));
  const bossflowRoot = path.join(root, '.bossflow');
  const credentialsPath = path.join(bossflowRoot, 'credentials.local.yaml');
  await mkdir(bossflowRoot);
  await writeFile(credentialsPath, 'apiKey: secret\n', 'utf8');
  return { root, worktreesRoot, credentialsPath };
}
