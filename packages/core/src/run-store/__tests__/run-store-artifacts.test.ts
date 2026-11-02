import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { FileRunStore } from '../index.js';

describe('FileRunStore artifacts', () => {
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

  it('classifies all artifact kinds by filename', async () => {
    const runsRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-runs-'));

    try {
      const store = new FileRunStore({ runsRoot });
      const run = await store.create({
        repositoryPath: '/tmp/project',
        goal: 'Unknown artifact',
        modelProfile: 'openai',
      });
      for (const fileName of [
        'request.md',
        'implementation.json',
        'decision.md',
        'verification.json',
        'review.md',
        'summary.md',
        'notes',
      ]) {
        await store.writeMarkdown(run, fileName, fileName);
      }

      await expect(store.read(run.id)).resolves.toMatchObject({
        artifacts: expect.arrayContaining([
          expect.objectContaining({ kind: 'implementation', fileName: 'implementation.json' }),
          expect.objectContaining({ kind: 'decision', fileName: 'decision.md' }),
          expect.objectContaining({ kind: 'verification', fileName: 'verification.json' }),
          expect.objectContaining({ kind: 'review', fileName: 'review.md' }),
          expect.objectContaining({ kind: 'summary', fileName: 'summary.md' }),
          expect.objectContaining({ kind: 'other', fileName: 'notes' }),
        ]),
      });
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });
});
