import { userInfo } from 'node:os';
import path from 'node:path';

import { FileRunStore, inspectProject } from '@bossflow/core';
import type { WorkflowRun } from '@bossflow/core';

import { loadConfig } from '../config/index.js';
import { resolveModelRuntime } from '../models/index.js';
import { writeLine } from '../output/index.js';
import type {
  AdapterInstallCommandOptions,
  ApproveCommandOptions,
  RunCommandOptions,
} from '../types.js';
import { createDefaultCodingAgentRegistry } from './coding-agent-registry.js';
import { CLI_EXIT_CODES, DEFAULT_CODING_AGENT_ID } from './constant.js';
import { WorkflowCliError } from './error.js';
import { renderWorkflowStatus } from './renderer.js';
import { WorkflowService } from './workflow-service.js';

export async function executeAdapterInstall(
  adapterId: string,
  options: AdapterInstallCommandOptions,
  registry = createDefaultCodingAgentRegistry(),
): Promise<void> {
  const projectRoot = path.resolve(options.project ?? process.cwd());
  if (!registry.has(adapterId)) {
    throw new WorkflowCliError(
      `Unsupported Coding Agent adapter "${adapterId}".`,
      CLI_EXIT_CODES.USAGE_ERROR,
    );
  }
  if (!registry.supportsSkillInstallation(adapterId)) {
    throw new WorkflowCliError(
      `Coding Agent adapter "${adapterId}" does not support Skill installation.`,
      CLI_EXIT_CODES.USAGE_ERROR,
    );
  }
  const adapterName = registry.describe(adapterId).displayName;
  const result = await registry.installSkill(adapterId, {
    projectRoot,
    ...(options.overwrite === true ? { overwrite: true } : {}),
  });
  if (result.status === 'conflict') {
    throw new WorkflowCliError(
      `A different ${adapterName} integration already exists at "${result.skillPath}".`,
      CLI_EXIT_CODES.ADAPTER_CONFLICT,
      'Review the existing Skill, then re-run with --overwrite only if replacement is intended.',
    );
  }
  writeLine(
    result.status === 'already-installed'
      ? `${adapterName} integration is already installed: ${result.skillPath}`
      : `Installed ${adapterName} integration: ${result.skillPath}`,
  );
}

export async function executeRun(
  projectRoot: string,
  goal: string,
  options: RunCommandOptions,
): Promise<void> {
  const config = await loadConfig(projectRoot);
  const projectContext = await inspectProject(projectRoot, {
    verification: config.workflow.verification,
  });
  if (projectContext.profile.requiresConfirmation && options.confirmProject !== true) {
    throw new Error(
      'Project verification requires confirmation:\n' +
        projectContext.profile.ambiguities.map((ambiguity) => `- ${ambiguity}`).join('\n') +
        '\nRe-run with --confirm-project or configure workflow.verification.commandOverrides.',
    );
  }
  const resolvedRuntime = await resolveModelRuntime({
    projectRoot,
    ...(options.profile === undefined ? {} : { profileName: options.profile }),
    ...(options.model === undefined ? {} : { modelOverride: options.model }),
  });
  const result = await createWorkflowService(projectRoot, config).run({
    goal,
    projectContext,
    modelRuntime: resolvedRuntime.runtime,
    modelProfile: resolvedRuntime.profileName,
    confirmedProject: options.confirmProject === true,
    stopAfterSpec: options.stopAfter === 'spec',
  });

  writeLine(`Run created: ${result.run.id}`);
  writeLine(
    `Artifacts: ${path.join(path.resolve(projectRoot, config.workflow.runDirectory), result.run.id)}`,
  );
  writeLine(
    `Reasoning model: ${resolvedRuntime.profileName}; ` +
      `credential source: ${resolvedRuntime.credentialSource}.`,
  );
  writeLine(
    `Coding agent: ${DEFAULT_CODING_AGENT_ID}; model and authentication are managed by the adapter.`,
  );
  writeLine(
    `Project: ${projectContext.profile.packageManager}; ` +
      `Git ${projectContext.profile.git.status}; ` +
      `${projectContext.profile.verificationCommands.length} verification commands.`,
  );
  writeLine(
    `Specification created with ${result.specification.acceptanceCriteria.length} acceptance criteria.`,
  );
  if (result.plan === undefined) {
    writeLine(`Next action: bossflow resume ${result.run.id}`);
    return;
  }
  writeLine(`Technical plan created with ${result.plan.tasks.length} tasks.`);
  writeLine(`Plan approval required: bossflow approve ${result.run.id} --gate plan`);
}

export async function executeStatus(projectRoot: string, runId: string): Promise<void> {
  const config = await loadConfig(projectRoot);
  const service = createWorkflowService(projectRoot, config);
  writeLine(renderWorkflowStatus(await service.status(runId)).trimEnd());
}

export async function executeApprove(
  projectRoot: string,
  runId: string,
  options: ApproveCommandOptions,
): Promise<void> {
  const config = await loadConfig(projectRoot);
  const service = createWorkflowService(projectRoot, config);
  const run = await service.approve({
    runId,
    gate: options.gate,
    actions: options.action,
    actor: options.actor ?? userInfo().username,
    ...(options.note === undefined ? {} : { note: options.note }),
  });
  writeLine(`Approval recorded for run ${run.id} at gate "${options.gate}".`);
  if (options.gate === 'plan') {
    writeLine(`Next action: bossflow resume ${run.id}`);
  } else if (options.action.length === 0) {
    writeLine('No external actions were authorized.');
  } else {
    writeLine(`Authorized external actions: ${options.action.join(', ')}.`);
  }
}

export async function executeResume(projectRoot: string, runId: string): Promise<void> {
  const config = await loadConfig(projectRoot);
  const service = createWorkflowService(projectRoot, config);
  const current = await service.getRun(runId);
  const needsModel = !['review_approval', 'completed', 'blocked', 'failed'].includes(current.stage);
  const resolvedRuntime = needsModel
    ? await resolveModelRuntime({
        projectRoot,
        profileName: current.modelProfile,
        ...(current.model === undefined ? {} : { modelOverride: current.model }),
      })
    : undefined;
  const run = await service.resume({
    runId,
    ...(resolvedRuntime === undefined
      ? { redactionSecrets: [] }
      : {
          modelRuntime: resolvedRuntime.runtime,
          redactionSecrets: resolvedRuntime.redactionSecrets,
        }),
  });
  for (const message of getResumeMessages(run)) {
    writeLine(message);
  }
}

export function getResumeMessages(run: WorkflowRun): string[] {
  const messages = [`Run ${run.id} stopped at stage "${run.stage}".`];
  if (run.stage === 'plan_approval') {
    messages.push(`Plan approval required: bossflow approve ${run.id} --gate plan`);
  } else if (run.stage === 'review_approval') {
    messages.push(
      `Review approval required: bossflow approve ${run.id} --gate review --action <commit|push|merge|pr>`,
    );
  } else if (run.stage === 'completed') {
    messages.push('Workflow completed.');
  }
  return messages;
}

function createWorkflowService(
  projectRoot: string,
  config: Awaited<ReturnType<typeof loadConfig>>,
): WorkflowService {
  const runsRoot = path.resolve(projectRoot, config.workflow.runDirectory);
  return new WorkflowService({
    store: new FileRunStore({ runsRoot }),
    implementer: createDefaultCodingAgentRegistry().createImplementer(DEFAULT_CODING_AGENT_ID),
  });
}
