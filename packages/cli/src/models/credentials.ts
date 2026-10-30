import { randomUUID } from 'node:crypto';
import { chmod, lstat, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { parse, stringify } from 'yaml';
import { z } from 'zod';

import {
  BOSSFLOW_DIRECTORY,
  CREDENTIALS_FILE,
  CREDENTIALS_FILE_MODE,
  DEFAULT_COMPATIBLE_API_KEY_ENV,
} from '../config/index.js';
import { OPENAI_API_KEY_ENV } from '../environment/index.js';
import type { CredentialResolution, ModelProfile } from '../config/index.js';

const CredentialsSchema = z.record(z.string().trim().min(1), z.string().trim().min(1));
const ApiKeySchema = z.string().trim().min(1);

export async function resolveCredential(
  projectRoot: string,
  profileName: string,
  profile: ModelProfile,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<CredentialResolution> {
  const envName = getCredentialEnvName(profile);
  const environmentValue = ApiKeySchema.safeParse(environment[envName]);
  if (environmentValue.success) {
    return {
      source: 'environment',
      envName,
      apiKey: environmentValue.data,
    };
  }

  const credentials = await readCredentials(projectRoot);
  const storedValue = ApiKeySchema.safeParse(credentials[profileName]);
  if (storedValue.success) {
    return {
      source: 'local-file',
      envName,
      apiKey: storedValue.data,
    };
  }

  return {
    source: 'missing',
    envName,
  };
}

export async function writeStoredApiKey(
  projectRoot: string,
  profileName: string,
  apiKey: string,
): Promise<void> {
  const normalizedKey = ApiKeySchema.parse(apiKey);
  const credentials = await readCredentials(projectRoot);
  const targetPath = credentialsPath(projectRoot);
  const tempPath = `${targetPath}.${randomUUID()}.tmp`;

  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(
    tempPath,
    stringify({
      ...credentials,
      [profileName]: normalizedKey,
    }),
    {
      encoding: 'utf8',
      mode: CREDENTIALS_FILE_MODE,
    },
  );
  await chmod(tempPath, CREDENTIALS_FILE_MODE);
  await rename(tempPath, targetPath);
  await chmod(targetPath, CREDENTIALS_FILE_MODE);
}

export async function clearStoredApiKey(
  projectRoot: string,
  profileName: string,
): Promise<boolean> {
  const credentials = await readCredentials(projectRoot);
  if (credentials[profileName] === undefined) {
    return false;
  }

  const nextCredentials = { ...credentials };
  delete nextCredentials[profileName];
  const targetPath = credentialsPath(projectRoot);

  if (Object.keys(nextCredentials).length === 0) {
    await unlink(targetPath);
    return true;
  }

  const tempPath = `${targetPath}.${randomUUID()}.tmp`;
  await writeFile(tempPath, stringify(nextCredentials), {
    encoding: 'utf8',
    mode: CREDENTIALS_FILE_MODE,
  });
  await chmod(tempPath, CREDENTIALS_FILE_MODE);
  await rename(tempPath, targetPath);
  await chmod(targetPath, CREDENTIALS_FILE_MODE);
  return true;
}

function getCredentialEnvName(profile: ModelProfile): string {
  return (
    profile.apiKeyEnv ??
    (profile.kind === 'openai' ? OPENAI_API_KEY_ENV : DEFAULT_COMPATIBLE_API_KEY_ENV)
  );
}

async function readCredentials(projectRoot: string): Promise<Record<string, string>> {
  const targetPath = credentialsPath(projectRoot);
  try {
    const fileStat = await lstat(targetPath);
    if (!fileStat.isFile()) {
      throw new Error('The credentials path must be a regular file.');
    }
    if (process.platform !== 'win32' && (fileStat.mode & 0o077) !== 0) {
      throw new Error(
        'The credentials file permissions are too broad. Run "chmod 600 .bossflow/credentials.local.yaml".',
      );
    }

    const content = await readFile(targetPath, 'utf8');
    return CredentialsSchema.parse(parse(content));
  } catch (error: unknown) {
    if (isMissingFileError(error)) {
      return {};
    }
    throw new Error('Unable to read the local BossFlow credentials file.', {
      cause: error,
    });
  }
}

function credentialsPath(projectRoot: string): string {
  return path.join(projectRoot, BOSSFLOW_DIRECTORY, CREDENTIALS_FILE);
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
