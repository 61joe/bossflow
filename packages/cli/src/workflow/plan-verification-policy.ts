import type { ProjectProfile, TechnicalPlan, VerificationCommand } from '@bossflow/core';

import { CLI_EXIT_CODES } from './constant.js';
import { WorkflowCliError } from './error.js';
import type { PlanVerificationAdoption } from './types.js';

export function adoptPlanVerificationCommands(
  profile: ProjectProfile | undefined,
  plan: TechnicalPlan,
  commandIds: readonly string[],
): PlanVerificationAdoption {
  const ids = commandIds.map((commandId) => commandId.trim());
  if (new Set(ids).size !== ids.length) {
    throw new WorkflowCliError(
      'Plan verification command IDs must be unique.',
      CLI_EXIT_CODES.USAGE_ERROR,
    );
  }
  if (profile === undefined) {
    throw new WorkflowCliError(
      'Cannot adopt Plan verification commands without a persisted project profile.',
      CLI_EXIT_CODES.MISSING_ARTIFACT,
    );
  }
  const planCommands = new Map<string, VerificationCommand>();
  for (const command of plan.verificationCommands) {
    if (planCommands.has(command.id)) {
      throw new WorkflowCliError(
        `Technical Plan contains duplicate verification command ID "${command.id}".`,
        CLI_EXIT_CODES.USAGE_ERROR,
      );
    }
    planCommands.set(command.id, command);
  }
  const selected = ids.map((commandId) => {
    const command = planCommands.get(commandId);
    if (command === undefined) {
      throw new WorkflowCliError(
        `Technical Plan does not contain verification command "${commandId}".`,
        CLI_EXIT_CODES.USAGE_ERROR,
      );
    }
    return command;
  });
  const existingById = new Map(
    profile.verificationCommands.map((command) => [command.id, command]),
  );
  const additions: VerificationCommand[] = [];
  for (const command of selected) {
    const existing = existingById.get(command.id);
    if (existing !== undefined && !commandsEqual(existing, command)) {
      throw new WorkflowCliError(
        `Plan verification command "${command.id}" conflicts with the project profile.`,
        CLI_EXIT_CODES.USAGE_ERROR,
      );
    }
    if (existing === undefined) {
      additions.push(command);
    }
  }
  return {
    commandIds: ids,
    commands: selected,
    projectProfile: {
      ...profile,
      verificationCommands: [...profile.verificationCommands, ...additions],
    },
  };
}

export function sameVerificationIds(left: readonly string[], right: readonly string[]): boolean {
  const leftIds = new Set(left);
  const rightIds = new Set(right);
  return (
    leftIds.size === rightIds.size && [...leftIds].every((commandId) => rightIds.has(commandId))
  );
}

function commandsEqual(left: VerificationCommand, right: VerificationCommand): boolean {
  return (
    left.id === right.id &&
    left.label === right.label &&
    left.command === right.command &&
    left.required === right.required &&
    left.timeoutMs === right.timeoutMs &&
    (left.cwd ?? '') === (right.cwd ?? '') &&
    left.args.length === right.args.length &&
    left.args.every((argument, index) => argument === right.args[index])
  );
}
