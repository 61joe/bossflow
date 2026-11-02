import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { FileRunStore } from '../index.js';

describe('FileRunStore safety and concurrency', () => {
  it('rejects traversal run identifiers before filesystem access', async () => {
    const runsRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-runs-'));

    try {
      const store = new FileRunStore({ runsRoot });
      const run = await store.create({
        repositoryPath: '/tmp/project',
        goal: 'Path traversal',
        modelProfile: 'openai',
      });

      await expect(store.read('../escape')).rejects.toThrow('Invalid run ID');
      await expect(store.save({ ...run, id: '../escape' })).rejects.toThrow('Invalid run ID');
      await expect(
        store.writeMarkdown({ ...run, id: '../escape' }, 'escape.md', '#'),
      ).rejects.toThrow('Invalid run ID');
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('serializes concurrent transitions without losing revisions', async () => {
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
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('retains all artifact references during concurrent writes', async () => {
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
      const persisted = await store.read(run.id);

      expect(persisted.artifacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ fileName: 'spec.json' }),
          expect.objectContaining({ fileName: 'review.md' }),
        ]),
      );
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('rejects stale run state writes', async () => {
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
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('rejects artifact paths outside the run directory', async () => {
    const runsRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-runs-'));

    try {
      const store = new FileRunStore({ runsRoot });
      const run = await store.create({
        repositoryPath: '/tmp/project',
        goal: 'Test path safety',
        modelProfile: 'openai',
      });

      await expect(store.writeMarkdown(run, '../escape.md', '# Escape')).rejects.toThrow(
        'Invalid artifact file name',
      );
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });
});
