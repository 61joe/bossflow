import type { WorktreeImplementer } from '../implementation/index.js';

export interface AdapterDescriptor {
  readonly id: string;
  readonly displayName: string;
  readonly invocation: string;
}

/** Creates the Build-stage implementation executor owned by a Coding Agent integration. */
export interface CodingAgentAdapter {
  describe(): AdapterDescriptor;
  createWorktreeImplementer(): WorktreeImplementer;
}

export type CodingAgentSkillInstallStatus =
  'installed' | 'already-installed' | 'conflict' | 'overwritten';

export interface CodingAgentSkillInstallOptions {
  readonly projectRoot: string;
  /** Replace a conflicting integration only after explicit user confirmation. */
  readonly overwrite?: boolean;
}

export interface CodingAgentSkillInstallResult {
  readonly status: CodingAgentSkillInstallStatus;
  readonly skillPath: string;
}

/** Optional capability for adapters that can install a project-level Skill integration. */
export interface CodingAgentSkillInstaller {
  installSkill(options: CodingAgentSkillInstallOptions): Promise<CodingAgentSkillInstallResult>;
}
