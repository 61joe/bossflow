#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const cdIndex = args.indexOf('--cd');
const worktreeRoot = cdIndex === -1 ? undefined : args[cdIndex + 1];
const prompt = args.at(-1);

if (worktreeRoot === undefined || prompt === undefined) {
  process.stderr.write('Fake Codex expected --cd and an implementation prompt.\n');
  process.exit(2);
}

const approvedPaths = readApprovedPaths(prompt);
const implementationPaths = chooseImplementationPaths(approvedPaths);
if (implementationPaths.length === 0) {
  process.stderr.write('Fake Codex could not find an approved implementation path.\n');
  process.exit(2);
}

for (const implementationPath of implementationPaths) {
  const targetPath = resolveTargetPath(worktreeRoot, implementationPath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  const existing = await readFile(targetPath, 'utf8').catch((error) => {
    if (isMissingFileError(error)) {
      return '';
    }
    throw error;
  });
  const addition = targetPath.endsWith('.test.ts')
    ? [
        "import { bossflowSmoke } from './index.js';",
        "if (bossflowSmoke !== 'ok') {",
        "  throw new Error('Unexpected smoke value.');",
        '}',
        '',
      ].join('\n')
    : "\nexport const bossflowSmoke = 'ok';\n";
  await writeFile(targetPath, `${existing}${addition}`, 'utf8');
  process.stdout.write(`Fake Codex wrote ${path.relative(worktreeRoot, targetPath)}.\n`);
}

function readApprovedPaths(implementationPrompt) {
  const start = implementationPrompt.indexOf('Approved paths:\n');
  const end = implementationPrompt.indexOf('Technical plan:\n');
  if (start === -1 || end === -1 || end <= start) {
    return [];
  }
  return implementationPrompt
    .slice(start + 'Approved paths:\n'.length, end)
    .split('\n')
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim());
}

function chooseImplementationPaths(paths) {
  const filePaths = paths.filter((entry) => /\.(?:ts|tsx|js|jsx|mjs|cjs)$/i.test(entry));
  if (filePaths.length > 0) {
    return filePaths;
  }
  const directory = paths.find((entry) => !entry.includes('*'));
  return directory === undefined ? [] : [directory];
}

function resolveTargetPath(root, approvedPath) {
  const normalized = approvedPath
    .replaceAll('\\', '/')
    .replace(/\/\*\*?$/, '')
    .replace(/\/+$/, '');
  if (normalized.length === 0 || normalized.startsWith('/') || normalized.includes('..')) {
    process.stderr.write(`Fake Codex rejected unsafe approved path "${approvedPath}".\n`);
    process.exit(2);
  }
  const target =
    path.extname(normalized).length === 0
      ? path.join(root, normalized, 'bossflow-smoke.ts')
      : path.join(root, normalized);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    process.stderr.write(`Fake Codex rejected path outside the worktree: "${approvedPath}".\n`);
    process.exit(2);
  }
  return target;
}

function isMissingFileError(error) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
