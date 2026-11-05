/* eslint-disable max-lines-per-function -- Attempt scenarios share one legacy and retry fixture. */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { FileRunStore, findActiveArtifact, findActiveArtifactByFileName } from '../index.js';

describe('FileRunStore attempts', () => {
  it('archives current artifacts and resolves only the active attempt', async () => {
    const runsRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-runs-attempt-'));

    try {
      const store = new FileRunStore({ runsRoot });
      const created = await store.create({
        repositoryPath: '/tmp/project',
        goal: 'Retry an implementation',
        modelProfile: 'openai',
      });
      await store.writeJson(created, 'implementation.json', { attempt: 1 });
      const first = await store.read(created.id);
      const attemptUpdatedAt = new Date(Date.parse(first.updatedAt) + 1_000).toISOString();
      await store.save({
        ...first,
        attempt: 2,
        updatedAt: attemptUpdatedAt,
      });
      const archiveUpdatedAt = new Date(Date.parse(attemptUpdatedAt) + 1_000).toISOString();
      const archived = await store.archiveArtifacts(
        created.id,
        ['implementation.json', 'missing.json'],
        archiveUpdatedAt,
      );

      expect(archived).toMatchObject({ attempt: 2 });
      expect(findActiveArtifact(archived, 'implementation', 'implementation.json')).toBeUndefined();
      expect(findActiveArtifactByFileName(archived, 'implementation.json')).toBeUndefined();
      expect(archived.artifacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            fileName: 'attempt-1-implementation.json',
            attempt: 1,
            supersededAt: archiveUpdatedAt,
          }),
        ]),
      );
      await expect(
        readFile(path.join(runsRoot, created.id, 'attempt-1-implementation.json'), 'utf8'),
      ).resolves.toContain('"attempt": 1');

      await store.writeJson(archived, 'implementation.json', { attempt: 2 });
      const retried = await store.read(created.id);
      expect(findActiveArtifact(retried, 'implementation', 'implementation.json')).toMatchObject({
        attempt: 2,
      });
      expect(
        findActiveArtifact(retried, 'implementation', 'implementation.json')?.supersededAt,
      ).toBeUndefined();
      expect(findActiveArtifactByFileName(retried, 'implementation.json')).toMatchObject({
        attempt: 2,
      });
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('rejects archival of modified evidence', async () => {
    const runsRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-runs-attempt-'));

    try {
      const store = new FileRunStore({ runsRoot });
      const run = await store.create({
        repositoryPath: '/tmp/project',
        goal: 'Protect evidence',
        modelProfile: 'openai',
      });
      await store.writeJson(run, 'verification.json', { status: 'passed' });
      await writeFile(
        path.join(runsRoot, run.id, 'verification.json'),
        '{"status":"failed"}',
        'utf8',
      );

      await expect(
        store.archiveArtifacts(
          run.id,
          ['verification.json'],
          new Date(Date.parse(run.updatedAt) + 1_000).toISOString(),
        ),
      ).rejects.toThrow('has been modified');
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('archives legacy evidence without attempt or hash metadata', async () => {
    const runsRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-runs-attempt-'));

    try {
      const store = new FileRunStore({ runsRoot });
      const run = await store.create({
        repositoryPath: '/tmp/project',
        goal: 'Legacy evidence',
        modelProfile: 'openai',
      });
      const legacyPath = path.join(runsRoot, run.id, 'legacy.txt');
      await writeFile(legacyPath, 'legacy evidence', 'utf8');
      await writeFile(
        path.join(runsRoot, run.id, 'run.json'),
        JSON.stringify({
          ...run,
          attempt: undefined,
          artifacts: [
            {
              kind: 'other',
              fileName: 'legacy.txt',
              path: legacyPath,
              createdAt: run.createdAt,
            },
          ],
        }),
        'utf8',
      );
      const archived = await store.archiveArtifacts(
        run.id,
        ['legacy.txt'],
        new Date(Date.parse(run.updatedAt) + 1_000).toISOString(),
      );
      expect(archived).toMatchObject({
        attempt: 1,
        artifacts: [
          expect.objectContaining({
            fileName: 'attempt-1-legacy.txt',
            attempt: 1,
            supersededAt: expect.any(String),
          }),
        ],
      });
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('defaults legacy run and artifact attempts and rejects stale attempts', async () => {
    const runsRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-runs-attempt-'));

    try {
      const store = new FileRunStore({ runsRoot });
      const created = await store.create({
        repositoryPath: '/tmp/project',
        goal: 'Legacy attempt',
        modelProfile: 'openai',
      });
      await writeFile(
        path.join(runsRoot, created.id, 'run.json'),
        JSON.stringify({
          schemaVersion: 1,
          id: created.id,
          repositoryPath: '/tmp/project',
          goal: 'Legacy attempt',
          modelProfile: 'openai',
          stage: 'spec',
          artifacts: [
            {
              kind: 'request',
              fileName: 'request.md',
              path: path.join(runsRoot, created.id, 'request.md'),
              createdAt: '2026-11-03T00:00:00.000Z',
            },
          ],
          createdAt: '2026-11-03T00:00:00.000Z',
          updatedAt: '2026-11-03T00:00:00.000Z',
        }),
        'utf8',
      );

      const legacy = await store.read(created.id);
      expect(legacy.attempt).toBe(1);
      expect(legacy.artifacts?.[0]?.attempt).toBe(1);

      const current = await store.save({
        ...legacy,
        attempt: 2,
        updatedAt: new Date(Date.parse(legacy.updatedAt) + 1_000).toISOString(),
      });
      await expect(
        store.save({
          ...current,
          attempt: 1,
          updatedAt: new Date(Date.parse(current.updatedAt) + 1_000).toISOString(),
        }),
      ).rejects.toThrow('attempt 1 cannot overwrite attempt 2');

      await writeFile(
        path.join(runsRoot, created.id, 'run.json'),
        JSON.stringify({ ...current, attempt: 0 }),
        'utf8',
      );
      await expect(store.read(created.id)).rejects.toThrow();
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('claims a retry atomically so concurrent callers cannot both advance the Run', async () => {
    const runsRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-runs-attempt-'));

    try {
      const store = new FileRunStore({ runsRoot });
      const created = await store.create({
        repositoryPath: '/tmp/project',
        goal: 'Concurrent retry',
        modelProfile: 'openai',
      });
      await store.writeJson(created, 'implementation.json', { status: 'completed' });
      const current = await store.read(created.id);
      const blocked = await store.save({
        ...current,
        stage: 'blocked',
        updatedAt: new Date(Date.parse(current.updatedAt) + 1_000).toISOString(),
      });
      const options = {
        target: 'build' as const,
        expectedAttempt: blocked.attempt ?? 1,
        expectedWorkflowRevision: blocked.workflowRevision ?? 1,
        expectedUpdatedAt: blocked.updatedAt,
        evidenceFileNames: ['implementation.json'],
        updatedAt: new Date(Date.parse(blocked.updatedAt) + 1_000).toISOString(),
      };

      const results = await Promise.allSettled([
        store.beginRetry(blocked.id, options),
        store.beginRetry(blocked.id, options),
      ]);

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
      await expect(store.read(blocked.id)).resolves.toMatchObject({
        stage: 'build',
        attempt: 2,
        workflowRevision: 2,
      });
      await expect(
        readFile(path.join(runsRoot, blocked.id, 'attempt-1-implementation.json'), 'utf8'),
      ).resolves.toContain('"status": "completed"');
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('rejects a retry claim when same-revision evidence changed after validation', async () => {
    const runsRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-runs-attempt-'));

    try {
      const store = new FileRunStore({ runsRoot });
      const run = await store.create({
        repositoryPath: '/tmp/project',
        goal: 'Stale retry validation',
        modelProfile: 'openai',
      });
      const blocked = await store.save({
        ...run,
        stage: 'blocked',
        updatedAt: new Date(Date.parse(run.updatedAt) + 1_000).toISOString(),
      });
      await expect(
        store.beginRetry(blocked.id, {
          target: 'build',
          expectedAttempt: 1,
          expectedWorkflowRevision: blocked.workflowRevision ?? 1,
          expectedUpdatedAt: run.updatedAt,
          evidenceFileNames: [],
          updatedAt: new Date(Date.parse(blocked.updatedAt) + 1_000).toISOString(),
        }),
      ).rejects.toThrow('changed after retry validation');
      await expect(store.read(blocked.id)).resolves.toMatchObject({
        stage: 'blocked',
        attempt: 1,
      });
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('rejects retry claims with stale attempt or workflow revision values', async () => {
    const runsRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-runs-attempt-'));

    try {
      const store = new FileRunStore({ runsRoot });
      const run = await store.create({
        repositoryPath: '/tmp/project',
        goal: 'Stale retry claim',
        modelProfile: 'openai',
      });
      const blocked = await store.save({
        ...run,
        stage: 'blocked',
        updatedAt: new Date(Date.parse(run.updatedAt) + 1_000).toISOString(),
      });
      const baseOptions = {
        target: 'build' as const,
        expectedAttempt: 2,
        expectedWorkflowRevision: blocked.workflowRevision ?? 1,
        expectedUpdatedAt: blocked.updatedAt,
        evidenceFileNames: [],
        updatedAt: new Date(Date.parse(blocked.updatedAt) + 1_000).toISOString(),
      };
      await expect(store.beginRetry(blocked.id, baseOptions)).rejects.toThrow(
        'attempt changed from 2 to 1',
      );
      await expect(
        store.beginRetry(blocked.id, {
          ...baseOptions,
          expectedAttempt: 1,
          expectedWorkflowRevision: 99,
        }),
      ).rejects.toThrow('workflow revision changed from 99 to 1');
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });
});
