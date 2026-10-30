import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { FileRunStore } from '../index.js';

describe('FileRunStore', () => {
  it('creates a run directory with request and metadata artifacts', async () => {
    const runsRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-runs-'));

    try {
      const store = new FileRunStore({ runsRoot });
      const run = await store.create({
        repositoryPath: '/tmp/project',
        goal: 'Add export support',
        modelProfile: 'openai',
        model: 'test-model',
      });

      const request = await readFile(path.join(runsRoot, run.id, 'request.md'), 'utf8');
      const metadata = await readFile(path.join(runsRoot, run.id, 'run.json'), 'utf8');

      expect(request).toContain('Add export support');
      expect(JSON.parse(metadata)).toMatchObject({
        id: run.id,
        stage: 'spec',
        goal: 'Add export support',
        modelProfile: 'openai',
        model: 'test-model',
      });
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
