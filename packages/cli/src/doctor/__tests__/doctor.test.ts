import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { initializeProject } from '../../config/index.js';
import { inspectDoctor } from '../index.js';

describe('inspectDoctor', () => {
  it('reports a project without configuration', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-doctor-'));

    try {
      await expect(inspectDoctor(projectRoot)).resolves.toMatchObject({
        nodeVersion: process.version,
        configFound: false,
      });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('reports the selected model profile and credential source', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-doctor-'));
    const environmentKey = process.env.OPENAI_API_KEY;

    try {
      process.env.OPENAI_API_KEY = 'doctor-key';
      await initializeProject(projectRoot);

      await expect(inspectDoctor(projectRoot)).resolves.toMatchObject({
        configFound: true,
        modelProfileName: 'openai',
        credentialSource: 'environment',
        credentialEnvName: 'OPENAI_API_KEY',
      });
    } finally {
      if (environmentKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = environmentKey;
      }
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
