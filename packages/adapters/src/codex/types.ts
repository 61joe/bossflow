export type CodexSkillInstallStatus =
  'installed' | 'already-installed' | 'conflict' | 'overwritten';

export interface CodexSkillInstallOptions {
  readonly projectRoot: string;
  /** Replace an existing, different SKILL.md only after explicit user confirmation. */
  readonly overwrite?: boolean;
}

export interface CodexSkillInstallResult {
  readonly status: CodexSkillInstallStatus;
  readonly skillPath: string;
}
