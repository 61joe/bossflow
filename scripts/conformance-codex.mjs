import { execFile } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs, promisify } from 'node:util';

import {
  CONFORMANCE_SCENARIOS,
  buildConformanceReport,
  finalizeConformanceFixture,
  getConformanceScenario,
  writeConformanceReport,
} from '../packages/cli/dist/index.js';

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, '..');
const cliPath = path.join(repositoryRoot, 'packages', 'cli', 'dist', 'bin.js');
const SECRET_ENV_PATTERN = /(?:^|_)(?:API_?KEY|KEY|TOKEN|SECRET|PASSWORD|CREDENTIALS?)$/i;
const COMMAND_TIMEOUT_MS = 30 * 60 * 1_000;
const args = process.argv.slice(2);
if (args[0] === '--') {
  args.shift();
}

const { values } = parseArgs({
  args,
  options: {
    scenario: { type: 'string' },
    profile: { type: 'string' },
    'output-dir': { type: 'string', default: 'docs/conformance/evidence' },
    'keep-on-failure': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
  allowPositionals: false,
});

if (values.help || values.scenario === undefined) {
  printHelp();
  process.exit(values.help ? 0 : 2);
}

const scenario = getConformanceScenario(values.scenario);
const fixtureRoot = await mkdtemp(path.join(tmpdir(), `bossflow-conformance-${scenario.id}-`));
const worktreesRoot = path.join(
  path.dirname(fixtureRoot),
  '.bossflow-worktrees',
  path.basename(fixtureRoot),
);
const targetConfigRoot = path.join(fixtureRoot, '.bossflow');
const targetCredentials = path.join(targetConfigRoot, 'credentials.local.yaml');
const localCredentialSecrets = await readLocalCredentialSecrets(repositoryRoot);
let runId;
let failureMessage;
let reportPath;
let outcome = 'failed';

try {
  await createFixtureRepository(fixtureRoot, scenario.files);
  await copyLocalConfiguration(repositoryRoot, fixtureRoot);
  await ensureCodexReady();

  const runResult = await runCli(
    ['run', scenario.goal, ...(values.profile === undefined ? [] : ['--profile', values.profile])],
    fixtureRoot,
  );
  if (runResult.exitCode !== 0) {
    failureMessage = `run failed with exit code ${runResult.exitCode}: ${boundedError(runResult)}`;
  } else {
    runId = parseRunId(runResult.stdout);
    const steps = [
      ['approve', runId, '--gate', 'plan', '--actor', 'conformance'],
      ['resume', runId],
      ['approve', runId, '--gate', 'review', '--actor', 'conformance'],
      ['resume', runId],
    ];
    for (const step of steps) {
      const result = await runCli(step, fixtureRoot);
      if (result.exitCode !== 0) {
        failureMessage = `${step[0]} failed with exit code ${result.exitCode}: ${boundedError(result)}`;
        break;
      }
    }
  }

  if (runId === undefined) {
    throw new Error(failureMessage ?? 'The conformance run did not return a run ID.');
  }
  const report = await buildConformanceReport({
    runId,
    runsRoot: path.join(fixtureRoot, '.bossflow', 'runs'),
    scenario,
    secrets: [...collectEnvironmentSecrets(), ...localCredentialSecrets],
    ...(failureMessage === undefined ? {} : { failureMessage }),
  });
  reportPath = await writeConformanceReport({
    report,
    outputDirectory: path.resolve(values['output-dir']),
  });
  outcome = report.outcome;
  process.stdout.write(
    [
      'Codex conformance finished.',
      `Scenario: ${scenario.id}`,
      `Profile: ${scenario.projectProfile}`,
      `Run: ${runId}`,
      `Stage: ${report.stage}`,
      `Outcome: ${report.outcome}`,
      `Report: ${reportPath}`,
    ].join('\n') + '\n',
  );
  if (report.outcome !== 'completed') {
    process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`Conformance failed: ${errorMessage(error)}\n`);
  process.exitCode = 1;
} finally {
  const cleanup = await finalizeConformanceFixture({
    fixtureRoot,
    worktreesRoot,
    credentialsPath: targetCredentials,
    outcome,
    keepOnFailure: values['keep-on-failure'] === true,
  });
  if (cleanup.retained) {
    process.stderr.write(`Conformance fixture retained at ${fixtureRoot}.\n`);
  }
}

function printHelp() {
  process.stdout.write(
    `Usage: pnpm conformance:codex -- --scenario <id> [options]

Scenarios:
${CONFORMANCE_SCENARIOS.map(({ id, projectProfile }) => `  ${id} (${projectProfile})`).join('\n')}

Options:
  --scenario <id>          Required conformance scenario
  --profile <name>         BossFlow reasoning model profile
  --output-dir <path>      Report directory; default docs/conformance/evidence
  --keep-on-failure        Retain the sanitized fixture after failure
  -h, --help               Show this help
`,
  );
}

async function createFixtureRepository(root, files) {
  for (const [fileName, content] of Object.entries(files)) {
    const targetPath = path.join(root, fileName);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, content, 'utf8');
  }
  await runRequired('git', ['init', '--initial-branch=main'], root, 'git init');
  await runRequired(
    'git',
    ['config', 'user.name', 'BossFlow Conformance'],
    root,
    'git config user.name',
  );
  await runRequired(
    'git',
    ['config', 'user.email', 'bossflow@example.com'],
    root,
    'git config user.email',
  );
  await runRequired('git', ['add', '--all'], root, 'git add');
  await runRequired(
    'git',
    ['commit', '-m', 'fixture: initialize conformance repository'],
    root,
    'git commit',
  );
}

async function copyLocalConfiguration(sourceRoot, targetRoot) {
  const configRoot = path.join(targetRoot, '.bossflow');
  await mkdir(configRoot, { recursive: true });
  await copyFile(
    path.join(sourceRoot, '.bossflow', 'config.yaml'),
    path.join(configRoot, 'config.yaml'),
  );
  const sourceCredentials = path.join(sourceRoot, '.bossflow', 'credentials.local.yaml');
  try {
    await stat(sourceCredentials);
    const credentials = path.join(configRoot, 'credentials.local.yaml');
    await copyFile(sourceCredentials, credentials);
    await chmod(credentials, 0o600);
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }
}

async function readLocalCredentialSecrets(sourceRoot) {
  const credentialsPath = path.join(sourceRoot, '.bossflow', 'credentials.local.yaml');
  try {
    const content = await readFile(credentialsPath, 'utf8');
    return content
      .split('\n')
      .map((line) => /^\s*[^:#\s][^:]*:\s*(.+?)\s*$/.exec(line)?.[1])
      .filter((value) => value !== undefined && value.length > 0)
      .map((value) => value.replace(/^(['"])(.*)\1$/, '$2'));
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }
    throw error;
  }
}

async function ensureCodexReady() {
  const version = await runCommand('codex', ['--version'], repositoryRoot);
  if (version.exitCode !== 0) {
    throw new Error(
      'Codex CLI is not available. Install and authenticate Codex before conformance.',
    );
  }
  const login = await runCommand('codex', ['login', 'status'], repositoryRoot);
  if (login.exitCode !== 0) {
    throw new Error('Codex CLI is not authenticated. Run "codex login" before conformance.');
  }
}

async function runCli(args, cwd) {
  return runCommand(process.execPath, [cliPath, ...args], cwd);
}

async function runRequired(command, args, cwd, label) {
  const result = await runCommand(command, args, cwd);
  if (result.exitCode !== 0) {
    throw new Error(`${label} failed: ${boundedError(result)}`);
  }
  return result;
}

async function runCommand(command, args, cwd) {
  try {
    const result = await execFileAsync(command, args, {
      cwd,
      env: process.env,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
      timeout: COMMAND_TIMEOUT_MS,
    });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      exitCode: typeof error.code === 'number' ? error.code : 1,
      stdout: typeof error.stdout === 'string' ? error.stdout : '',
      stderr: [typeof error.stderr === 'string' ? error.stderr : '', errorMessage(error)]
        .filter((entry) => entry.length > 0)
        .join('\n'),
    };
  }
}

function parseRunId(output) {
  const match = output.match(/^Run created: ([0-9a-f-]+)$/m);
  if (match?.[1] === undefined) {
    throw new Error('The conformance run did not report a run ID.');
  }
  return match[1];
}

function collectEnvironmentSecrets() {
  return Object.entries(process.env)
    .filter(
      ([name, value]) => SECRET_ENV_PATTERN.test(name) && value !== undefined && value.length > 0,
    )
    .map(([, value]) => value);
}

function boundedError(result) {
  return `${result.stderr}\n${result.stdout}`.trim().slice(0, 2_000);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function isMissingFileError(error) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
