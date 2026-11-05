import type { inspectProject } from '@bossflow/core';

import type { CredentialSource, ModelProfile } from '../config/index.js';

export interface DoctorCheck {
  readonly id:
    'node' | 'config' | 'credential' | 'git' | 'package' | 'worktree-root' | 'inspection';
  readonly label: string;
  readonly passed: boolean;
  readonly detail: string;
  readonly remedy?: string | undefined;
}

export interface DoctorPreflightReport {
  readonly status: 'ready' | 'not-ready';
  readonly checks: readonly DoctorCheck[];
}

export interface DoctorOptions {
  readonly runPreflight?: boolean;
  readonly nodeVersion?: string;
  readonly projectInspector?: typeof inspectProject;
}

export type DoctorReport =
  | {
      readonly nodeVersion: string;
      readonly configFound: false;
      readonly preflight?: DoctorPreflightReport | undefined;
    }
  | {
      readonly nodeVersion: string;
      readonly configFound: true;
      readonly modelProfileName: string;
      readonly modelProfile: ModelProfile;
      readonly credentialSource: CredentialSource;
      readonly credentialEnvName: string;
      readonly preflight?: DoctorPreflightReport | undefined;
    };
