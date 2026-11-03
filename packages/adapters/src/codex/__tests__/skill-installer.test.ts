import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { CodexAdapter, installCodexSkill } from '../index.js';

describe('Codex Skill installer', () => {
  it('installs idempotently without modifying unrelated skills', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-codex-skill-'));
    const canonicalRoot = await realpath(projectRoot);
    const unrelatedSkill = path.join(canonicalRoot, '.agents', 'skills', 'other', 'SKILL.md');
    const skillPath = path.join(canonicalRoot, '.agents', 'skills', 'bossflow', 'SKILL.md');
    await mkdir(path.dirname(unrelatedSkill), { recursive: true });
    await writeFile(unrelatedSkill, 'unrelated skill\n', 'utf8');

    try {
      const adapter = new CodexAdapter();
      await expect(adapter.installSkill({ projectRoot })).resolves.toEqual({
        status: 'installed',
        skillPath,
      });
      await expect(adapter.installSkill({ projectRoot })).resolves.toEqual({
        status: 'already-installed',
        skillPath,
      });
      await expect(readFile(unrelatedSkill, 'utf8')).resolves.toBe('unrelated skill\n');
      const installedSkill = await readFile(skillPath, 'utf8');
      expect(installedSkill).toContain('bossflow run "<开发目标>"');
      expect(installedSkill).toContain('bossflow approve <run-id> --gate plan');
      expect(installedSkill).toContain('当前 workflow revision 的 Review approval');
      expect(installedSkill).toContain('run.json.worktree.path');
      expect(installedSkill).toContain('确认 `stage=completed`');
      expect(installedSkill).toContain('`run.json.stage` 为 `completed`');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('returns conflicts and overwrites only after explicit confirmation', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-codex-skill-conflict-'));
    const canonicalRoot = await realpath(projectRoot);
    const skillPath = path.join(canonicalRoot, '.agents', 'skills', 'bossflow', 'SKILL.md');
    await mkdir(path.dirname(skillPath), { recursive: true });
    await writeFile(skillPath, 'custom skill\n', 'utf8');

    try {
      await expect(installCodexSkill({ projectRoot })).resolves.toEqual({
        status: 'conflict',
        skillPath,
      });
      await expect(readFile(skillPath, 'utf8')).resolves.toBe('custom skill\n');
      await expect(installCodexSkill({ projectRoot, overwrite: true })).resolves.toEqual({
        status: 'overwritten',
        skillPath,
      });
      await expect(readFile(skillPath, 'utf8')).resolves.toContain('# BossFlow');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('rejects non-directory project roots and skill path components', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'bossflow-codex-skill-invalid-'));
    const projectFile = path.join(root, 'project.txt');
    const blockedProject = path.join(root, 'blocked-project');
    const directoryCollision = path.join(root, 'directory-collision');
    await writeFile(projectFile, 'not a directory', 'utf8');
    await mkdir(blockedProject);
    await writeFile(path.join(blockedProject, '.agents'), 'not a directory', 'utf8');
    await mkdir(path.join(directoryCollision, '.agents', 'skills'), { recursive: true });
    await mkdir(path.join(directoryCollision, '.agents', 'skills', 'bossflow', 'SKILL.md'), {
      recursive: true,
    });

    try {
      await expect(installCodexSkill({ projectRoot: projectFile })).rejects.toThrow(
        'must be a directory',
      );
      await expect(installCodexSkill({ projectRoot: blockedProject })).rejects.toThrow(
        'must be a directory',
      );
      await expect(installCodexSkill({ projectRoot: directoryCollision })).rejects.toThrow(
        'must be a regular file',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  const symlinkTest = process.platform === 'win32' ? it.skip : it;
  symlinkTest('rejects symbolic links in skill directories and target files', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'bossflow-codex-skill-symlink-'));
    const outside = path.join(root, 'outside');
    const linkedProject = path.join(root, 'linked-project');
    const fileLinkProject = path.join(root, 'file-link-project');
    await mkdir(outside);
    await mkdir(linkedProject);
    await mkdir(path.join(fileLinkProject, '.agents', 'skills', 'bossflow'), { recursive: true });
    await symlink(outside, path.join(linkedProject, '.agents'), 'dir');
    await symlink(
      path.join(outside, 'skill.md'),
      path.join(fileLinkProject, '.agents', 'skills', 'bossflow', 'SKILL.md'),
    );

    try {
      await expect(installCodexSkill({ projectRoot: linkedProject })).rejects.toThrow(
        'must not be a symbolic link',
      );
      await expect(installCodexSkill({ projectRoot: fileLinkProject })).rejects.toThrow(
        'must not be a symbolic link',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
