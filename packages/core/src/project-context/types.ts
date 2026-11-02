import type { VerificationCommand } from '../contracts/index.js';

export type VerificationCommandKind = 'lint' | 'typecheck' | 'test' | 'build';
export type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun' | 'unknown';
export type GitWorktreeStatus = 'clean' | 'dirty' | 'not-repository';

export interface VerificationCommandOverride {
  readonly command: string;
  readonly args: readonly string[];
  readonly timeoutMs?: number | undefined;
}

export interface VerificationSettings {
  readonly requiredCommands: readonly VerificationCommandKind[];
  readonly defaultTimeoutMs: number;
  readonly commandOverrides: Readonly<
    Partial<Record<VerificationCommandKind, VerificationCommandOverride>>
  >;
}

export interface ResolvedVerificationCommands {
  readonly commands: readonly VerificationCommand[];
  readonly ambiguities: readonly string[];
}

export interface ProjectGitStatus {
  readonly isRepository: boolean;
  readonly branch?: string | undefined;
  readonly status: GitWorktreeStatus;
  readonly changedPaths: readonly string[];
}

export interface GitRepositoryInfo {
  readonly repositoryRoot: string;
  readonly status: ProjectGitStatus;
}

export interface GitCommandClient {
  revparse(args: readonly string[]): Promise<string>;
  status(): Promise<{
    readonly current: string | null;
    readonly files: readonly { readonly path: string }[];
  }>;
}

export type GitCommandClientFactory = (candidatePath: string) => GitCommandClient;

export interface ProjectProfile {
  readonly schemaVersion: 1;
  readonly repositoryRoot: string;
  readonly git: ProjectGitStatus;
  readonly packageManager: PackageManager;
  readonly languages: readonly string[];
  readonly frameworks: readonly string[];
  readonly conventionFiles: readonly string[];
  readonly planningContextFiles: readonly string[];
  readonly testConfigFiles: readonly string[];
  readonly packageScripts: Readonly<Record<string, string>>;
  readonly verificationCommands: readonly VerificationCommand[];
  readonly ambiguities: readonly string[];
  readonly requiresConfirmation: boolean;
  readonly confirmedByUser: boolean;
}

export interface ProjectContextDocument {
  readonly path: string;
  readonly content: string;
  readonly truncated: boolean;
}

export interface ProjectContextBundle {
  readonly profile: ProjectProfile;
  readonly documents: readonly ProjectContextDocument[];
}

export interface InspectProjectOptions {
  readonly verification: VerificationSettings;
}
