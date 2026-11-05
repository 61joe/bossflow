import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { FileRunStore } from '../index.js';

describe('FileRunStore validation', () => {
  it('rejects an empty run goal', async () => {
    const runsRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-runs-'));

    try {
      const store = new FileRunStore({ runsRoot });
      await expect(
        store.create({
          repositoryPath: '/tmp/project',
          goal: '   ',
          modelProfile: 'openai',
        }),
      ).rejects.toThrow('must not be empty');
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('saves a new run document without existing metadata', async () => {
    const runsRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-runs-'));

    try {
      const store = new FileRunStore({ runsRoot });
      const saved = await store.save({
        schemaVersion: 1,
        id: 'manual-run',
        repositoryPath: '/tmp/project',
        goal: 'Manual run',
        modelProfile: 'openai',
        stage: 'spec',
        attempt: 1,
        workflowRevision: 1,
        approvals: [],
        artifacts: [],
        createdAt: '2026-11-02T00:00:00.000Z',
        updatedAt: '2026-11-02T00:00:00.000Z',
      });

      await expect(store.read(saved.id)).resolves.toEqual(saved);
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

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
});
