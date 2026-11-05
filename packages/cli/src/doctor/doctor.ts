import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import path from 'node:path';

import {
  DEFAULT_WORKTREE_ROOT_DIRECTORY,
  createDefaultVerificationSettings,
  inspectProject,
  redactText,
} from '@bossflow/core';

import { BOSSFLOW_DIRECTORY, CONFIG_FILE, loadConfig } from '../config/index.js';
import type { BossFlowConfig, CredentialSource } from '../config/index.js';
import { getModelProfile, resolveCredential } from '../models/index.js';
import { inspectNodeVersion } from '../runtime/index.js';
import { formatError } from '../output/index.js';
import type { DoctorCheck, DoctorOptions, DoctorPreflightReport, DoctorReport } from './types.js';

export function inspectDoctor(
  projectRoot: string,
  options: DoctorOptions & { readonly runPreflight: true },
): Promise<DoctorReport & { readonly preflight: DoctorPreflightReport }>;
export function inspectDoctor(projectRoot: string, options?: DoctorOptions): Promise<DoctorReport>;
export async function inspectDoctor(
  projectRoot: string,
  options: DoctorOptions = {},
): Promise<DoctorReport> {
  const configPath = path.join(projectRoot, BOSSFLOW_DIRECTORY, CONFIG_FILE);
  const configFound = await fileExists(configPath);
  if (!configFound) {
    return {
      nodeVersion: process.version,
      configFound,
      ...(options.runPreflight === true
        ? {
            preflight: await inspectRunPreflight(
              projectRoot,
              false,
              undefined,
              'missing',
              options.nodeVersion ?? process.version,
              options.projectInspector,
            ),
          }
        : {}),
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
    ...(options.runPreflight === true
      ? {
          preflight: await inspectRunPreflight(
            projectRoot,
            true,
            config,
            credential.source,
            options.nodeVersion ?? process.version,
            options.projectInspector,
          ),
        }
      : {}),
  };
}

async function inspectRunPreflight(
  projectRoot: string,
  configFound: boolean,
  config: BossFlowConfig | undefined,
  credentialSource: CredentialSource,
  nodeVersion: string,
  projectInspector: typeof inspectProject = inspectProject,
): Promise<DoctorPreflightReport> {
  const checks = createRuntimeChecks(configFound, credentialSource, nodeVersion);
  try {
    checks.push(...(await inspectProjectChecks(projectRoot, config, projectInspector)));
  } catch (error: unknown) {
    checks.push(inspectionFailureCheck(error));
  }

  return {
    status: checks.every((check) => check.passed) ? 'ready' : 'not-ready',
    checks,
  };
}

function createRuntimeChecks(
  configFound: boolean,
  credentialSource: CredentialSource,
  nodeVersion: string,
): DoctorCheck[] {
  const node = inspectNodeVersion(nodeVersion);
  return [
    {
      id: 'node',
      label: 'Node.js',
      passed: node.supported,
      detail: node.message,
      ...(node.supported ? {} : { remedy: 'Switch to Node.js 24 or newer.' }),
    },
    {
      id: 'config',
      label: 'Configuration',
      passed: configFound,
      detail: configFound ? 'Configuration found.' : 'Configuration is missing.',
      ...(configFound ? {} : { remedy: 'Run "bossflow init".' }),
    },
    {
      id: 'credential',
      label: 'Model credential',
      passed: credentialSource !== 'missing',
      detail:
        credentialSource === 'missing'
          ? 'No model credential is available.'
          : `Credential source: ${credentialSource}.`,
      ...(credentialSource === 'missing'
        ? {
            remedy: 'Set the configured environment variable or run "bossflow auth set <profile>".',
          }
        : {}),
    },
  ];
}

async function inspectProjectChecks(
  projectRoot: string,
  config: BossFlowConfig | undefined,
  projectInspector: typeof inspectProject,
): Promise<DoctorCheck[]> {
  const context = await projectInspector(projectRoot, {
    verification: config?.workflow.verification ?? createDefaultVerificationSettings(),
  });
  const { profile } = context;
  const gitPassed = profile.git.isRepository && profile.git.status === 'clean';
  const worktreeRoot = path.join(
    path.dirname(profile.repositoryRoot),
    DEFAULT_WORKTREE_ROOT_DIRECTORY,
  );
  const worktreeRootWritable = profile.git.isRepository
    ? await isWritableDirectoryOrCreatable(worktreeRoot)
    : false;

  return [
    {
      id: 'git',
      label: 'Git worktree',
      passed: gitPassed,
      detail: profile.git.isRepository
        ? `Branch ${profile.git.branch}; status ${profile.git.status}.`
        : 'Project is not a Git repository.',
      ...(gitPassed
        ? {}
        : { remedy: 'Initialize Git and commit or stash local changes before Build.' }),
    },
    {
      id: 'package',
      label: 'Package metadata',
      passed: !profile.requiresConfirmation,
      detail:
        profile.ambiguities.length === 0
          ? 'Package manager and verification commands are unambiguous.'
          : profile.ambiguities.join(' '),
      ...(profile.requiresConfirmation
        ? { remedy: 'Add a unique lockfile or configure verification command overrides.' }
        : {}),
    },
    {
      id: 'worktree-root',
      label: 'Worktree root',
      passed: worktreeRootWritable,
      detail: worktreeRootWritable
        ? `A managed Worktree can be created under ${worktreeRoot}.`
        : `The Worktree root is not writable: ${worktreeRoot}.`,
      ...(worktreeRootWritable
        ? {}
        : {
            remedy:
              'Grant write access to the repository parent or configure a writable Worktree root.',
          }),
    },
  ];
}

function inspectionFailureCheck(error: unknown): DoctorCheck {
  const reason = redactText(formatError(error)).slice(0, 500);
  return {
    id: 'inspection',
    label: 'Project inspection',
    passed: false,
    detail:
      reason.length === 0
        ? 'Project inspection failed without a diagnostic.'
        : `Project inspection failed: ${reason}`,
    remedy: 'Resolve the reported repository error and run doctor again.',
  };
}

export async function isWritableDirectoryOrCreatable(targetPath: string): Promise<boolean> {
  try {
    const target = await stat(targetPath);
    if (!target.isDirectory()) {
      return false;
    }
    await access(targetPath, constants.W_OK | constants.X_OK);
    return true;
  } catch (error: unknown) {
    if (isMissingPath(error)) {
      const parent = path.dirname(targetPath);
      return isWritableDirectoryOrCreatable(parent);
    }
    return false;
  }
}

function isMissingPath(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
