import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { FileRunStore } from '../index.js';
import type { ProjectProfile } from '../../project-context/index.js';

const projectProfile: ProjectProfile = {
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
  conventionFiles: ['AGENTS.md'],
  planningContextFiles: ['AGENTS.md', 'README.md'],
  testConfigFiles: ['jest.config.ts'],
  packageScripts: { test: 'jest' },
  verificationCommands: [
    {
      id: 'test',
      label: 'Test',
      command: 'pnpm',
      args: ['run', 'test'],
      required: true,
      timeoutMs: 120_000,
    },
  ],
  ambiguities: [],
  requiresConfirmation: false,
  confirmedByUser: false,
};

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
        projectProfile,
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
        projectProfile,
        workflowRevision: 1,
        approvals: [],
        artifacts: [{ kind: 'request', fileName: 'request.md' }],
      });
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('indexes written artifacts and persists atomic transitions', async () => {
    const runsRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-runs-'));

    try {
      const store = new FileRunStore({ runsRoot });
      const run = await store.create({
        repositoryPath: '/tmp/project',
        goal: 'Persist workflow state',
        modelProfile: 'openai',
      });

      await store.writeJson(run, 'plan.json', { schemaVersion: 1, tasks: [] });
      await expect(store.readText(run, 'plan.json')).resolves.toContain('"schemaVersion": 1');
      const transition = await store.transition(run.id, 'plan', '2026-11-02T00:01:00.000Z');
      const persisted = await store.read(run.id);

      expect(transition.ok).toBe(true);
      expect(persisted.stage).toBe('plan');
      expect(persisted.workflowRevision).toBe(2);
      expect(persisted.artifacts).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: 'plan', fileName: 'plan.json' })]),
      );
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('reads legacy run metadata with default workflow fields', async () => {
    const runsRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-runs-'));

    try {
      const store = new FileRunStore({ runsRoot });
      const run = await store.create({
        repositoryPath: '/tmp/project',
        goal: 'Legacy run',
        modelProfile: 'openai',
      });
      const legacyRun = {
        schemaVersion: 1,
        id: run.id,
        repositoryPath: '/tmp/project',
        goal: 'Legacy run',
        modelProfile: 'openai',
        stage: 'spec',
        createdAt: '2026-11-02T00:00:00.000Z',
        updatedAt: '2026-11-02T00:00:00.000Z',
      };
      await writeFile(path.join(runsRoot, run.id, 'run.json'), JSON.stringify(legacyRun), 'utf8');

      await expect(store.read(run.id)).resolves.toMatchObject({
        workflowRevision: 1,
        approvals: [],
        artifacts: [],
      });
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });
});
