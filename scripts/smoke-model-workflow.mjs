import { execFile } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, '..');
const cliPath = path.join(repositoryRoot, 'packages', 'cli', 'dist', 'bin.js');
const profileName = process.argv[2] ?? 'deepseek';
const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-real-model-smoke-'));
const fakeBinRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-real-model-smoke-bin-'));
const worktreesRoot = path.join(
  path.dirname(fixtureRoot),
  '.bossflow-worktrees',
  path.basename(fixtureRoot),
);
const keepFixture = process.env.BOSSFLOW_SMOKE_KEEP === '1';
let runId;

try {
  await createFixtureRepository(fixtureRoot);
  await copyLocalConfiguration(repositoryRoot, fixtureRoot);
  await installFakeCodex(fakeBinRoot);
  const environment = {
    ...process.env,
    PATH: `${fakeBinRoot}${path.delimiter}${process.env.PATH ?? ''}`,
  };

  const runResult = await runCli(
    [
      'run',
      "Add `export const bossflowSmoke = 'ok';` to src/index.js. Do not modify any other file " +
        'or change package scripts. Keep the change limited to src/index.js. Use the ' +
        'repository-provided lint, typecheck, test, and build commands as required verification, ' +
        'and include exactly one additional command only as an advisory plan recommendation. ' +
        'The specification must contain exactly one acceptance criterion: importing src/index.js ' +
        "exposes bossflowSmoke equal to 'ok'.",
      '--profile',
      profileName,
    ],
    fixtureRoot,
    environment,
  );
  runId = parseRunId(runResult.stdout);
  await runCli(['approve', runId, '--gate', 'plan'], fixtureRoot, environment);
  await runCli(['resume', runId], fixtureRoot, environment);
  await runCli(['approve', runId, '--gate', 'review'], fixtureRoot, environment);
  const completed = await runCli(['resume', runId], fixtureRoot, environment);

  const runDirectory = path.join(fixtureRoot, '.bossflow', 'runs', runId);
  const run = JSON.parse(await readFile(path.join(runDirectory, 'run.json'), 'utf8'));
  const verification = JSON.parse(
    await readFile(path.join(runDirectory, 'verification.json'), 'utf8'),
  );
  const plan = JSON.parse(await readFile(path.join(runDirectory, 'plan.json'), 'utf8'));
  const review = JSON.parse(await readFile(path.join(runDirectory, 'review.json'), 'utf8'));
  if (run.stage !== 'completed') {
    throw new Error(`Expected completed stage, received "${run.stage}".`);
  }
  if (verification.status !== 'passed') {
    throw new Error(`Expected passed verification, received "${verification.status}".`);
  }
  const authoritativeCommands = run.projectProfile?.verificationCommands ?? [];
  const advisoryPlanCommands = plan.verificationCommands.filter(
    (plannedCommand) =>
      !authoritativeCommands.some((command) => commandsMatch(command, plannedCommand)),
  );
  if (advisoryPlanCommands.length === 0) {
    throw new Error('Expected at least one advisory command in the technical plan.');
  }
  if (verification.records.length !== authoritativeCommands.length) {
    throw new Error(
      `Expected ${authoritativeCommands.length} authoritative verification records, ` +
        `received ${verification.records.length}.`,
    );
  }
  const blockingFindings = review.findings.filter(
    (finding) =>
      (finding.severity === 'P0' || finding.severity === 'P1') && finding.status === 'open',
  );
  if (blockingFindings.length > 0) {
    throw new Error('Advisory plan commands produced blocking Review findings.');
  }

  process.stdout.write(
    [
      'Real-model smoke completed.',
      `Profile: ${profileName}`,
      `Run: ${runId}`,
      `Stage: ${run.stage}`,
      `Verification commands: ${verification.records.length}`,
      `Advisory plan commands: ${advisoryPlanCommands.length}`,
      `Review findings: ${review.findings.length}`,
      `Final CLI: ${completed.stdout.trim().split('\n').at(-1) ?? 'Workflow completed.'}`,
    ].join('\n') + '\n',
  );
} catch (error) {
  if (runId !== undefined) {
    await printFailureReview(fixtureRoot, runId);
  }
  throw error;
} finally {
  if (keepFixture) {
    process.stderr.write(`Smoke fixture retained at ${fixtureRoot}.\n`);
  } else {
    await rm(fixtureRoot, { recursive: true, force: true });
    await rm(worktreesRoot, { recursive: true, force: true });
  }
  await rm(fakeBinRoot, { recursive: true, force: true });
}

async function createFixtureRepository(root) {
  const files = {
    '.gitignore': '.bossflow/\n',
    'README.md': '# BossFlow real-model smoke fixture\n',
    'package.json': `${JSON.stringify(
      {
        name: 'bossflow-real-model-smoke',
        type: 'module',
        private: true,
        scripts: {
          lint: 'node --check src/index.js',
          typecheck: 'node --check src/index.js',
          test: 'node scripts/verify-runtime.mjs',
          build: 'node scripts/verify-runtime.mjs',
        },
      },
      null,
      2,
    )}\n`,
    'pnpm-lock.yaml': 'lockfileVersion: 9\n',
    'scripts/verify-runtime.mjs':
      "import { bossflowSmoke } from '../src/index.js';\n\n" +
      "if (bossflowSmoke !== 'ok') {\n" +
      '  throw new Error(`Unexpected bossflowSmoke value: ${String(bossflowSmoke)}`);\n' +
      '}\n\n' +
      'process.stdout.write(`bossflowSmoke=${bossflowSmoke}\\n`);\n',
    'src/index.js': 'export const fixture = true;\n',
  };
  for (const [fileName, content] of Object.entries(files)) {
    const targetPath = path.join(root, fileName);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, content, 'utf8');
  }
  await runCommand('git', ['init', '--initial-branch=main'], root);
  await runCommand('git', ['config', 'user.name', 'BossFlow Smoke'], root);
  await runCommand('git', ['config', 'user.email', 'bossflow@example.com'], root);
  await runCommand('git', ['add', '--all'], root);
  await runCommand('git', ['commit', '-m', 'fixture: initialize smoke repository'], root);
}

async function copyLocalConfiguration(sourceRoot, targetRoot) {
  const targetConfigRoot = path.join(targetRoot, '.bossflow');
  await mkdir(targetConfigRoot, { recursive: true });
  await copyFile(
    path.join(sourceRoot, '.bossflow', 'config.yaml'),
    path.join(targetConfigRoot, 'config.yaml'),
  );
  const credentialsPath = path.join(sourceRoot, '.bossflow', 'credentials.local.yaml');
  try {
    await stat(credentialsPath);
    const targetCredentials = path.join(targetConfigRoot, 'credentials.local.yaml');
    await copyFile(credentialsPath, targetCredentials);
    await chmod(targetCredentials, 0o600);
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }
}

async function installFakeCodex(fakeBinRoot) {
  await mkdir(fakeBinRoot, { recursive: true });
  const targetPath = path.join(fakeBinRoot, 'codex');
  await copyFile(path.join(repositoryRoot, 'scripts', 'fixtures', 'fake-codex.mjs'), targetPath);
  await chmod(targetPath, 0o755);
}

function parseRunId(output) {
  const match = output.match(/^Run created: ([0-9a-f-]+)$/m);
  if (match?.[1] === undefined) {
    throw new Error('The smoke workflow did not report a run ID.');
  }
  return match[1];
}

async function printFailureReview(root, smokeRunId) {
  const reviewPath = path.join(root, '.bossflow', 'runs', smokeRunId, 'review.json');
  try {
    const review = JSON.parse(await readFile(reviewPath, 'utf8'));
    process.stderr.write(`Smoke review findings:\n${JSON.stringify(review.findings, null, 2)}\n`);
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }
}

async function runCli(args, cwd, environment) {
  return runCommand(process.execPath, [cliPath, ...args], cwd, environment);
}

async function runCommand(command, args, cwd, environment = process.env) {
  return execFileAsync(command, args, {
    cwd,
    env: environment,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
}

function isMissingFileError(error) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function commandsMatch(left, right) {
  return (
    left.id === right.id &&
    left.command === right.command &&
    left.args.length === right.args.length &&
    left.args.every((argument, index) => argument === right.args[index]) &&
    (left.cwd ?? '') === (right.cwd ?? '')
  );
}
