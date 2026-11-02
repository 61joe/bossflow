import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { FileRunStore } from '../index.js';

describe('FileRunStore concurrency', () => {
  it('serializes concurrent transitions', async () => {
    const runsRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-runs-'));

    try {
      const store = new FileRunStore({ runsRoot });
      const run = await store.create({
        repositoryPath: '/tmp/project',
        goal: 'Concurrent transitions',
        modelProfile: 'openai',
      });

      const results = await Promise.all([
        store.transition(run.id, 'plan', '2026-11-02T00:01:00.000Z'),
        store.transition(run.id, 'blocked', '2026-11-02T00:01:01.000Z'),
      ]);
      const persisted = await store.read(run.id);

      expect(results.every((result) => result.ok)).toBe(true);
      expect(persisted.workflowRevision).toBe(3);
      await expect(
        store.transition(run.id, persisted.stage, '2026-11-02T00:01:02.000Z'),
      ).resolves.toMatchObject({ ok: true, run: { workflowRevision: 3 } });
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('retains artifact references during concurrent writes', async () => {
    const runsRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-runs-'));

    try {
      const store = new FileRunStore({ runsRoot });
      const run = await store.create({
        repositoryPath: '/tmp/project',
        goal: 'Concurrent artifacts',
        modelProfile: 'openai',
      });

      await Promise.all([
        store.writeJson(run, 'spec.json', { schemaVersion: 1 }),
        store.writeMarkdown(run, 'review.md', '# Review'),
      ]);
      await expect(store.read(run.id)).resolves.toMatchObject({
        artifacts: expect.arrayContaining([
          expect.objectContaining({ fileName: 'spec.json' }),
          expect.objectContaining({ fileName: 'review.md' }),
        ]),
      });
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('rejects stale state and accepts a newer revision', async () => {
    const runsRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-runs-'));

    try {
      const store = new FileRunStore({ runsRoot });
      const staleRun = await store.create({
        repositoryPath: '/tmp/project',
        goal: 'Reject stale writes',
        modelProfile: 'openai',
      });
      await store.transition(staleRun.id, 'plan', '2026-11-02T00:01:00.000Z');
      await expect(store.save(staleRun)).rejects.toThrow('Stale run state');

      const currentRun = await store.read(staleRun.id);
      await expect(
        store.save({ ...currentRun, updatedAt: '2026-11-01T00:00:00.000Z' }),
      ).rejects.toThrow('Stale run state');
      await expect(
        store.save({
          ...currentRun,
          workflowRevision: (currentRun.workflowRevision ?? 1) + 1,
          updatedAt: '2026-11-03T00:00:00.000Z',
        }),
      ).resolves.toMatchObject({
        workflowRevision: (currentRun.workflowRevision ?? 1) + 1,
      });
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });
});
