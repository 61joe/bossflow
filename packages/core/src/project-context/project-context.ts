import { open, realpath } from 'node:fs/promises';
import path from 'node:path';

import fg from 'fast-glob';
import { z } from 'zod';

import {
  CONTEXT_FILE_PATTERNS,
  FRAMEWORK_DEPENDENCIES,
  LANGUAGE_BY_EXTENSION,
  LOCKFILE_PACKAGE_MANAGERS,
  MAX_CONTEXT_FILE_BYTES,
  MAX_PROJECT_CONTEXT_FILES,
  PROJECT_IGNORE_PATTERNS,
  PROJECT_SOURCE_PATTERNS,
  TEST_CONFIG_PATTERNS,
} from './constant.js';
import { GitRepositoryInspector } from './git-inspector.js';
import { redactText } from '../redaction/index.js';
import { ProjectProfileSchema } from './schema.js';
import { createDefaultVerificationSettings } from './schema.js';
import type {
  InspectProjectOptions,
  PackageManager,
  ProjectContextBundle,
  ProjectContextDocument,
} from './types.js';
import { VerificationCommandResolver } from './verification-command-resolver.js';

const PackageJsonSchema = z
  .object({
    scripts: z.record(z.string(), z.string()).optional(),
    dependencies: z.record(z.string(), z.string()).optional(),
    devDependencies: z.record(z.string(), z.string()).optional(),
  })
  .passthrough();

interface PackageMetadata {
  readonly scripts: Readonly<Record<string, string>>;
  readonly dependencies: Readonly<Record<string, string>>;
  readonly exists: boolean;
}

export class ProjectContextInspector {
  readonly #gitInspector: GitRepositoryInspector;
  readonly #commandResolver: VerificationCommandResolver;

  constructor(
    gitInspector = new GitRepositoryInspector(),
    commandResolver = new VerificationCommandResolver(),
  ) {
    this.#gitInspector = gitInspector;
    this.#commandResolver = commandResolver;
  }

  async inspect(
    candidatePath: string,
    options: InspectProjectOptions = {
      verification: createDefaultVerificationSettings(),
    },
  ): Promise<ProjectContextBundle> {
    const git = await this.#gitInspector.inspect(candidatePath);
    const repositoryRoot = git.repositoryRoot;
    const packageMetadata = await readPackageMetadata(repositoryRoot);
    const packageManagerResult = await detectPackageManager(repositoryRoot, packageMetadata.exists);
    const planningContextFiles = await findFiles(repositoryRoot, CONTEXT_FILE_PATTERNS);
    const testConfigFiles = await findFiles(repositoryRoot, TEST_CONFIG_PATTERNS);
    const sourceFiles = await findFiles(repositoryRoot, PROJECT_SOURCE_PATTERNS);
    const frameworks = detectFrameworks(packageMetadata.dependencies, [
      ...planningContextFiles,
      ...sourceFiles,
    ]);
    const commandResult = this.#commandResolver.resolve({
      packageManager: packageManagerResult.packageManager,
      packageScripts: packageMetadata.scripts,
      settings: options.verification,
    });
    const ambiguities = unique([
      ...(git.status.isRepository ? [] : ['The project is not initialized as a Git repository.']),
      ...packageMetadata.ambiguities,
      ...packageManagerResult.ambiguities,
      ...commandResult.ambiguities,
    ]);
    const profile = ProjectProfileSchema.parse({
      schemaVersion: 1,
      repositoryRoot,
      git: git.status,
      packageManager: packageManagerResult.packageManager,
      languages: detectLanguages(sourceFiles),
      frameworks,
      conventionFiles: planningContextFiles.filter(isConventionFile),
      planningContextFiles,
      testConfigFiles,
      packageScripts: redactPackageScripts(packageMetadata.scripts),
      verificationCommands: commandResult.commands,
      ambiguities,
      requiresConfirmation: ambiguities.length > 0,
      confirmedByUser: false,
    });
    const documents = await readProjectContextDocuments(repositoryRoot, [
      ...planningContextFiles,
      ...testConfigFiles,
    ]);
    return {
      profile,
      documents,
    };
  }
}

export async function inspectProject(
  candidatePath: string,
  options: InspectProjectOptions = {
    verification: createDefaultVerificationSettings(),
  },
): Promise<ProjectContextBundle> {
  return new ProjectContextInspector().inspect(candidatePath, options);
}

async function detectPackageManager(
  repositoryRoot: string,
  hasPackageJson: boolean,
): Promise<{
  readonly packageManager: PackageManager;
  readonly ambiguities: readonly string[];
}> {
  const packageManagers: PackageManager[] = [];
  for (const [lockfile, packageManager] of Object.entries(LOCKFILE_PACKAGE_MANAGERS)) {
    if (await fileExists(path.join(repositoryRoot, lockfile))) {
      packageManagers.push(packageManager);
    }
  }
  const uniquePackageManagers = unique(packageManagers);
  if (uniquePackageManagers.length > 1) {
    return {
      packageManager: 'unknown',
      ambiguities: [
        `Multiple package manager lockfiles were found: ${uniquePackageManagers.join(', ')}.`,
      ],
    };
  }
  if (uniquePackageManagers.length === 1) {
    // A one-element array is non-empty despite noUncheckedIndexedAccess.
    const packageManager = uniquePackageManagers[0] as PackageManager;
    return {
      packageManager,
      ambiguities: [],
    };
  }
  return {
    packageManager: 'unknown',
    ambiguities: hasPackageJson
      ? ['package.json exists but no supported package manager lockfile was found.']
      : [],
  };
}

async function readPackageMetadata(repositoryRoot: string): Promise<
  PackageMetadata & {
    readonly ambiguities: readonly string[];
  }
> {
  const packageJsonPath = path.join(repositoryRoot, 'package.json');
  let content: string;
  try {
    const handle = await open(packageJsonPath, 'r');
    try {
      content = await handle.readFile('utf8');
    } finally {
      await handle.close();
    }
  } catch (error: unknown) {
    if (isFileMissingError(error)) {
      return {
        scripts: {},
        dependencies: {},
        exists: false,
        ambiguities: [],
      };
    }
    throw error;
  }

  try {
    const parsed = PackageJsonSchema.parse(JSON.parse(content));
    return {
      scripts: parsed.scripts ?? {},
      dependencies: {
        ...parsed.dependencies,
        ...parsed.devDependencies,
      },
      exists: true,
      ambiguities: [],
    };
  } catch {
    return {
      scripts: {},
      dependencies: {},
      exists: true,
      ambiguities: ['package.json could not be parsed or validated.'],
    };
  }
}

async function findFiles(repositoryRoot: string, patterns: readonly string[]): Promise<string[]> {
  const files = await fg([...patterns], {
    cwd: repositoryRoot,
    ignore: [...PROJECT_IGNORE_PATTERNS],
    onlyFiles: true,
    unique: true,
    dot: true,
  });
  return files
    .map(normalizeRelativePath)
    .filter((file) => file.length > 0)
    .sort()
    .slice(0, MAX_PROJECT_CONTEXT_FILES);
}

export async function readProjectContextDocuments(
  repositoryRoot: string,
  fileNames: readonly string[],
): Promise<ProjectContextDocument[]> {
  const uniqueFiles = unique(fileNames).slice(0, MAX_PROJECT_CONTEXT_FILES);
  const documents: ProjectContextDocument[] = [];
  for (const fileName of uniqueFiles) {
    const document = await readProjectContextDocument(repositoryRoot, fileName);
    if (document !== undefined) {
      documents.push(document);
    }
  }
  return documents;
}

export async function readProjectContextDocument(
  repositoryRoot: string,
  fileName: string,
): Promise<ProjectContextDocument | undefined> {
  const absolutePath = await resolveExistingContextPath(repositoryRoot, fileName);
  if (absolutePath === undefined) {
    return undefined;
  }
  const handle = await open(absolutePath, 'r');

  try {
    const size = (await handle.stat()).size;
    const byteLength = Math.min(size, MAX_CONTEXT_FILE_BYTES);
    const buffer = Buffer.alloc(byteLength);
    const { bytesRead } = await handle.read(buffer, 0, byteLength, 0);
    return {
      path: fileName,
      content: buffer.subarray(0, bytesRead).toString('utf8'),
      truncated: size > bytesRead,
    };
  } finally {
    await handle.close();
  }
}

async function resolveExistingContextPath(
  repositoryRoot: string,
  fileName: string,
): Promise<string | undefined> {
  const lexicalPath = safeResolve(repositoryRoot, fileName);
  const canonicalRoot = await realpath(repositoryRoot);
  let canonicalFile: string;
  try {
    canonicalFile = await realpath(lexicalPath);
  } catch (error: unknown) {
    if (isFileMissingError(error)) {
      return undefined;
    }
    throw error;
  }
  if (canonicalFile !== canonicalRoot && !canonicalFile.startsWith(`${canonicalRoot}${path.sep}`)) {
    throw new Error(`Context file "${fileName}" resolves outside the repository root.`);
  }
  return canonicalFile;
}

export function detectLanguages(sourceFiles: readonly string[]): string[] {
  const languages = new Set<string>();
  for (const file of sourceFiles) {
    const extension = path.extname(file);
    const language = LANGUAGE_BY_EXTENSION[extension];
    if (language !== undefined) {
      languages.add(language);
    }
  }
  return [...languages].sort();
}

function detectFrameworks(
  dependencies: Readonly<Record<string, string>>,
  contextFiles: readonly string[],
): string[] {
  const frameworks = new Set<string>();
  for (const [dependency, framework] of Object.entries(FRAMEWORK_DEPENDENCIES)) {
    if (dependencies[dependency] !== undefined) {
      frameworks.add(framework);
    }
  }
  if (contextFiles.some((file) => /(?:^|\/)next\.config\./.test(file))) {
    frameworks.add('Next.js');
  }
  if (contextFiles.some((file) => /(?:^|\/)vite\.config\./.test(file))) {
    frameworks.add('Vite');
  }
  return [...frameworks].sort();
}

function isConventionFile(fileName: string): boolean {
  return (
    path.posix.basename(fileName) === 'AGENTS.md' ||
    path.posix.basename(fileName) === 'CONTRIBUTING.md' ||
    fileName.startsWith('openspec/')
  );
}

function normalizeRelativePath(fileName: string): string {
  return fileName.replaceAll('\\', '/').replace(/^\.\//, '');
}

function redactPackageScripts(
  scripts: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(scripts).map(([name, command]) => [name, redactText(command)]),
  );
}

function safeResolve(repositoryRoot: string, fileName: string): string {
  const root = path.resolve(repositoryRoot);
  const resolved = path.resolve(root, fileName);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Context file "${fileName}" is outside the repository root.`);
  }
  return resolved;
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const handle = await open(filePath, 'r');
    await handle.close();
    return true;
  } catch (error: unknown) {
    if (isFileMissingError(error)) {
      return false;
    }
    throw error;
  }
}

function isFileMissingError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
