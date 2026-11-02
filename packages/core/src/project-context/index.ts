export {
  ProjectProfileSchema,
  ProjectGitStatusSchema,
  VerificationCommandOverrideSchema,
  VerificationSettingsSchema,
  createDefaultVerificationSettings,
} from './schema.js';
export { inspectProject, ProjectContextInspector } from './project-context.js';
export { GitRepositoryInspector, isNotRepositoryError } from './git-inspector.js';
export { VerificationCommandResolver } from './verification-command-resolver.js';
export type {
  GitWorktreeStatus,
  GitCommandClient,
  GitCommandClientFactory,
  GitRepositoryInfo,
  InspectProjectOptions,
  PackageManager,
  ProjectContextBundle,
  ProjectContextDocument,
  ProjectGitStatus,
  ProjectProfile,
  ResolvedVerificationCommands,
  VerificationCommandKind,
  VerificationCommandOverride,
  VerificationSettings,
} from './types.js';
