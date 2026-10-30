import path from 'node:path';

import { password } from '@inquirer/prompts';
import { Command, CommanderError } from 'commander';
import { FileRunStore, generateSpecification, probeModelRuntime } from '@bossflow/core';

import {
  CLI_NAME,
  CLI_VERSION,
  SPECIFICATION_JSON_FILE,
  SPECIFICATION_MARKDOWN_FILE,
} from './constant.js';
import { initializeProject, loadConfig } from './config/index.js';
import { inspectDoctor } from './doctor/index.js';
import {
  addModelProfile,
  clearStoredApiKey,
  getModelProfile,
  listModelProfiles,
  removeModelProfile,
  resolveCredential,
  resolveModelRuntime,
  useModelProfile,
  writeStoredApiKey,
} from './models/index.js';
import { writeLine } from './output/index.js';
import { renderSpecification } from './specification/index.js';
import type { ModelProfile } from './config/index.js';
import type { AuthSetCommandOptions, ModelAddCommandOptions, RunCommandOptions } from './types.js';

export async function main(argv: readonly string[] = process.argv): Promise<number> {
  const program = new Command()
    .name(CLI_NAME)
    .description('Controlled multi-agent development workflow for Codex.')
    .version(CLI_VERSION)
    .exitOverride();

  program
    .command('doctor')
    .description('Inspect the local BossFlow environment.')
    .action(async () => {
      const report = await inspectDoctor(process.cwd());
      writeLine(`Node.js: ${report.nodeVersion}`);
      writeLine(`Config: ${report.configFound ? 'found' : 'missing'}`);
      if (report.modelProfileName !== undefined && report.modelProfile !== undefined) {
        writeLine(
          `Model profile: ${report.modelProfileName} ` +
            `(${formatModelProfile(report.modelProfile)})`,
        );
        writeLine(
          `Credential: ${formatCredentialSource(
            report.credentialSource,
            report.credentialEnvName,
          )}`,
        );
      }
    });

  program
    .command('init')
    .description('Create .bossflow/config.yaml in the current project.')
    .action(async () => {
      const result = await initializeProject(process.cwd());
      writeLine(
        result === 'created'
          ? 'Created .bossflow/config.yaml.'
          : '.bossflow/config.yaml already exists.',
      );
    });

  program
    .command('run')
    .description('Create a run and generate its initial specification.')
    .argument('<goal>', 'development goal')
    .option('--profile <profile>', 'model profile from .bossflow/config.yaml')
    .option('--model <model>', 'override the model identifier for this run')
    .action(async (goal: string, options: RunCommandOptions) => {
      await executeRun(process.cwd(), goal, options);
    });

  registerModelCommands(program);
  registerAuthCommands(program);

  try {
    await program.parseAsync([...argv]);
    return 0;
  } catch (error: unknown) {
    if (error instanceof CommanderError && error.exitCode === 0) {
      return 0;
    }
    throw error;
  }
}

function registerModelCommands(program: Command): void {
  const modelCommand = program.command('model').description('Manage local model profiles.');

  modelCommand
    .command('list')
    .description('List configured model profiles.')
    .action(async () => {
      const config = await loadConfig(process.cwd());
      for (const summary of listModelProfiles(config)) {
        const marker = summary.isDefault ? '*' : ' ';
        writeLine(`${marker} ${summary.name}: ${formatModelProfile(summary.profile)}`);
      }
    });

  modelCommand
    .command('add')
    .description('Create or replace a model profile.')
    .argument('<name>', 'profile name')
    .option('--kind <kind>', 'openai or openai-compatible', 'openai')
    .option('--model <model>', 'provider model identifier')
    .option('--base-url <url>', 'OpenAI or OpenAI-compatible API base URL')
    .option('--api-key-env <name>', 'environment variable containing the API key')
    .option('--chat-completions', 'use Chat Completions for an OpenAI profile')
    .option('--default', 'make this profile the default')
    .action(async (name: string, options: ModelAddCommandOptions) => {
      const summary = await addModelProfile(process.cwd(), {
        name,
        kind: parseModelKind(options.kind),
        ...(options.model === undefined ? {} : { model: options.model }),
        ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
        ...(options.apiKeyEnv === undefined ? {} : { apiKeyEnv: options.apiKeyEnv }),
        ...(options.chatCompletions === undefined
          ? {}
          : { useResponses: !options.chatCompletions }),
        setDefault: options.default === true,
      });
      writeLine(`Model profile "${summary.name}" saved${summary.isDefault ? ' as default' : ''}.`);
    });

  modelCommand
    .command('use')
    .description('Select the default model profile.')
    .argument('<name>', 'profile name')
    .action(async (name: string) => {
      await useModelProfile(process.cwd(), name);
      writeLine(`Model profile "${name}" is now the default.`);
    });

  modelCommand
    .command('remove')
    .description('Remove a non-default model profile.')
    .argument('<name>', 'profile name')
    .action(async (name: string) => {
      await removeModelProfile(process.cwd(), name);
      await clearStoredApiKey(process.cwd(), name);
      writeLine(`Model profile "${name}" removed.`);
    });

  modelCommand
    .command('test')
    .description('Call a model profile and validate structured output.')
    .argument('<name>', 'profile name')
    .action(async (name: string) => {
      const resolvedRuntime = await resolveModelRuntime({
        projectRoot: process.cwd(),
        profileName: name,
      });
      writeLine(
        `Testing model profile "${resolvedRuntime.profileName}" with credential source ` +
          `"${resolvedRuntime.credentialSource}".`,
      );
      const result = await probeModelRuntime(resolvedRuntime.runtime);
      writeLine(`Model probe succeeded: ${result.message}`);
    });
}

function registerAuthCommands(program: Command): void {
  const authCommand = program
    .command('auth')
    .description('Manage API keys stored outside project configuration.');

  authCommand
    .command('set')
    .description('Store an API key in .bossflow/credentials.local.yaml.')
    .argument('<profile>', 'model profile name')
    .option('--stdin', 'read the API key from standard input')
    .action(async (profileName: string, options: AuthSetCommandOptions) => {
      const config = await loadConfig(process.cwd());
      getModelProfile(config, profileName);
      if (options.stdin === true && process.stdin.isTTY === true) {
        throw new Error(
          'The --stdin option requires redirected input. Omit it to use the hidden interactive prompt.',
        );
      }
      const apiKey =
        options.stdin === true
          ? await readStandardInput()
          : await password({ message: `API key for model profile "${profileName}"` });
      await writeStoredApiKey(process.cwd(), profileName, apiKey);
      writeLine(`Credential stored for model profile "${profileName}".`);
    });

  authCommand
    .command('status')
    .description('Show credential sources without revealing API keys.')
    .action(async () => {
      const projectRoot = process.cwd();
      const config = await loadConfig(projectRoot);
      for (const summary of listModelProfiles(config)) {
        const credential = await resolveCredential(projectRoot, summary.name, summary.profile);
        writeLine(
          `${summary.name}: ${formatCredentialSource(credential.source, credential.envName)}`,
        );
      }
    });

  authCommand
    .command('clear')
    .description('Remove a profile API key from the local credentials file.')
    .argument('<profile>', 'profile name')
    .action(async (profileName: string) => {
      const removed = await clearStoredApiKey(process.cwd(), profileName);
      writeLine(
        removed
          ? `Local credential removed for model profile "${profileName}".`
          : `No local credential stored for model profile "${profileName}".`,
      );
    });
}

async function executeRun(
  projectRoot: string,
  goal: string,
  options: RunCommandOptions,
): Promise<void> {
  const resolvedRuntime = await resolveModelRuntime({
    projectRoot,
    ...(options.profile === undefined ? {} : { profileName: options.profile }),
    ...(options.model === undefined ? {} : { modelOverride: options.model }),
  });
  const config = await loadConfig(projectRoot);
  const runsRoot = path.resolve(projectRoot, config.workflow.runDirectory);
  const store = new FileRunStore({ runsRoot });
  const run = await store.create({
    repositoryPath: projectRoot,
    goal,
    modelProfile: resolvedRuntime.profileName,
    ...(resolvedRuntime.runtime.model === undefined
      ? {}
      : { model: resolvedRuntime.runtime.model }),
  });

  writeLine(`Run created: ${run.id}`);
  writeLine(`Artifacts: ${path.join(runsRoot, run.id)}`);
  writeLine(
    `Model: ${resolvedRuntime.profileName}; credential source: ${resolvedRuntime.credentialSource}.`,
  );

  const specification = await generateSpecification(goal, {
    modelRuntime: resolvedRuntime.runtime,
  });
  await store.writeJson(run, SPECIFICATION_JSON_FILE, specification);
  await store.writeMarkdown(run, SPECIFICATION_MARKDOWN_FILE, renderSpecification(specification));

  writeLine(
    `Specification created with ${specification.acceptanceCriteria.length} acceptance criteria.`,
  );
}

function parseModelKind(value: string): 'openai' | 'openai-compatible' {
  if (value === 'openai' || value === 'openai-compatible') {
    return value;
  }
  throw new Error('Model kind must be "openai" or "openai-compatible".');
}

function formatModelProfile(profile: ModelProfile): string {
  const model = profile.model ?? 'provider default model';
  const endpoint = profile.baseUrl ?? 'provider default endpoint';
  return `${profile.kind}, model=${model}, endpoint=${endpoint}`;
}

function formatCredentialSource(source: string | undefined, envName: string | undefined): string {
  if (source === 'environment') {
    return `environment variable ${envName}`;
  }
  if (source === 'local-file') {
    return `.bossflow/credentials.local.yaml (${envName} can override it)`;
  }
  return `missing (set ${envName ?? 'a profile API key'} or run "bossflow auth set <profile>")`;
}

async function readStandardInput(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString('utf8').trim();
}
