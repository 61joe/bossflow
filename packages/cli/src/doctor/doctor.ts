import { access } from 'node:fs/promises';
import path from 'node:path';

import { BOSSFLOW_DIRECTORY, CONFIG_FILE, loadConfig } from '../config/index.js';
import { getModelProfile, resolveCredential } from '../models/index.js';
import type { DoctorReport } from './types.js';

export async function inspectDoctor(projectRoot: string): Promise<DoctorReport> {
  const configPath = path.join(projectRoot, BOSSFLOW_DIRECTORY, CONFIG_FILE);
  const configFound = await fileExists(configPath);
  if (!configFound) {
    return {
      nodeVersion: process.version,
      configFound,
    };
  }

  const config = await loadConfig(projectRoot);
  const modelProfile = getModelProfile(config);
  const credential = await resolveCredential(projectRoot, modelProfile.name, modelProfile.profile);

  return {
    nodeVersion: process.version,
    configFound,
    modelProfileName: modelProfile.name,
    modelProfile: modelProfile.profile,
    credentialSource: credential.source,
    credentialEnvName: credential.envName,
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
