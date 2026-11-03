import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CodexSkillInstallOptions, CodexSkillInstallResult } from './types.js';

const CODEX_SKILL_SOURCE_PATH = fileURLToPath(
  new URL('../../assets/codex/bossflow/SKILL.md', import.meta.url),
);
const CODEX_SKILL_DIRECTORY_SEGMENTS = ['.agents', 'skills', 'bossflow'] as const;
const CODEX_SKILL_FILE = 'SKILL.md';

export async function installCodexSkill(
  options: CodexSkillInstallOptions,
): Promise<CodexSkillInstallResult> {
  const projectRoot = await resolveProjectRoot(options.projectRoot);
  const skillDirectory = await ensureSkillDirectory(projectRoot);
  const skillPath = path.join(skillDirectory, CODEX_SKILL_FILE);
  const nextContent = await readFile(CODEX_SKILL_SOURCE_PATH, 'utf8');
  const existing = await readExistingSkill(skillPath);

  if (existing === undefined) {
    await writeAtomic(skillPath, nextContent);
    return { status: 'installed', skillPath };
  }
  if (existing === nextContent) {
    return { status: 'already-installed', skillPath };
  }
  if (options.overwrite !== true) {
    return { status: 'conflict', skillPath };
  }

  await writeAtomic(skillPath, nextContent);
  return { status: 'overwritten', skillPath };
}

async function resolveProjectRoot(projectRoot: string): Promise<string> {
  const resolved = await realpath(projectRoot);
  const projectStat = await lstat(resolved);
  if (!projectStat.isDirectory()) {
    throw new Error('Codex Skill project root must be a directory.');
  }
  return resolved;
}

async function ensureSkillDirectory(projectRoot: string): Promise<string> {
  let currentPath = projectRoot;
  for (const segment of CODEX_SKILL_DIRECTORY_SEGMENTS) {
    currentPath = path.join(currentPath, segment);
    await ensureRealDirectory(currentPath);
  }

  return currentPath;
}

async function ensureRealDirectory(directoryPath: string): Promise<void> {
  try {
    const directoryStat = await lstat(directoryPath);
    if (directoryStat.isSymbolicLink()) {
      throw new Error(`Codex Skill path "${directoryPath}" must not be a symbolic link.`);
    }
    if (!directoryStat.isDirectory()) {
      throw new Error(`Codex Skill path "${directoryPath}" must be a directory.`);
    }
  } catch (error: unknown) {
    if (!isMissingFileError(error)) {
      throw error;
    }
    await mkdir(directoryPath);
  }
}

async function readExistingSkill(skillPath: string): Promise<string | undefined> {
  try {
    const skillStat = await lstat(skillPath);
    if (skillStat.isSymbolicLink()) {
      throw new Error(`Codex Skill file "${skillPath}" must not be a symbolic link.`);
    }
    if (!skillStat.isFile()) {
      throw new Error(`Codex Skill path "${skillPath}" must be a regular file.`);
    }
    return await readFile(skillPath, 'utf8');
  } catch (error: unknown) {
    if (isMissingFileError(error)) {
      return undefined;
    }
    throw error;
  }
}

async function writeAtomic(targetPath: string, content: string): Promise<void> {
  const tempPath = `${targetPath}.${randomUUID()}.tmp`;
  try {
    await writeFile(tempPath, content, 'utf8');
    await rename(tempPath, targetPath);
  } finally {
    await rm(tempPath, { force: true });
  }
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
