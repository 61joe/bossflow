import { createHash } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import path from 'node:path';

import type { WorkflowRun } from '../workflow/index.js';
import { findActiveArtifact } from '../run-store/index.js';
import { CommandRunner } from './command-runner.js';
import { VERIFICATION_JSON_FILE, VERIFICATION_MARKDOWN_FILE } from './constant.js';
import { renderVerification } from './renderer.js';
import { VerificationReportSchema } from './schema.js';
import type {
  VerificationCoordinatorOptions,
  VerificationOutcome,
  VerificationRecord,
  VerificationReport,
  VerifyWorkflowOptions,
} from './types.js';

export class VerificationCoordinator {
  readonly #store;
  readonly #commandRunner;
  readonly #now;

  constructor(options: VerificationCoordinatorOptions) {
    this.#store = options.store;
    this.#commandRunner =
      options.commandRunner ??
      new CommandRunner(options.secrets === undefined ? {} : { secrets: options.secrets });
    this.#now = options.now ?? (() => new Date());
  }

  async verify(options: VerifyWorkflowOptions): Promise<VerificationOutcome> {
    const run = await this.#store.read(options.runId);
    const recovered = await this.#recover(run);
    if (recovered !== undefined) {
      return recovered;
    }
    const worktree = requireVerificationWorktree(run);
    const commands = run.projectProfile?.verificationCommands;
    if (commands === undefined || commands.length === 0) {
      throw new Error(`Run "${run.id}" has no verification commands.`);
    }

    const startedAt = this.#now().toISOString();
    const records: VerificationRecord[] = [];
    let failedCommandId: string | undefined;
    for (const command of commands) {
      const cwd = await resolveCommandCwd(worktree.path, command.cwd);
      const result = await this.#commandRunner.run(command, cwd, options.signal);
      records.push({ command, result });
      if (command.required && result.status !== 'passed') {
        failedCommandId = command.id;
        break;
      }
    }
    const report: VerificationReport = VerificationReportSchema.parse({
      schemaVersion: 1,
      runId: run.id,
      status: failedCommandId === undefined ? 'passed' : 'failed',
      records,
      startedAt,
      endedAt: this.#now().toISOString(),
    });
    await this.#persist(run, report);
    const persisted = await this.#store.read(run.id);
    if (failedCommandId !== undefined) {
      const blocked = await this.#store.transition(run.id, 'blocked', this.#now().toISOString());
      if (!blocked.ok) {
        throw new Error(blocked.reason);
      }
      return {
        status: 'failed',
        run: blocked.run,
        report,
        failedCommandId,
      };
    }
    const review = await this.#store.transition(persisted.id, 'review', this.#now().toISOString());
    if (!review.ok) {
      throw new Error(review.reason);
    }
    return {
      status: 'passed',
      run: review.run,
      report,
    };
  }

  async #recover(run: WorkflowRun): Promise<VerificationOutcome | undefined> {
    const artifact = findActiveArtifact(run, 'verification', VERIFICATION_JSON_FILE);
    if (artifact?.sha256 === undefined) {
      return undefined;
    }
    const content = await this.#store.readText(run, VERIFICATION_JSON_FILE);
    const sha256 = createHash('sha256').update(content).digest('hex');
    if (sha256 !== artifact.sha256) {
      throw new Error(`Verification artifact "${VERIFICATION_JSON_FILE}" has been modified.`);
    }
    const report = VerificationReportSchema.parse(JSON.parse(content));
    if (report.runId !== run.id) {
      throw new Error('Verification artifact belongs to a different run.');
    }
    const target = report.status === 'passed' ? 'review' : 'blocked';
    if (run.stage === target) {
      return {
        status: 'already-completed',
        run,
        report,
      };
    }
    if (run.stage !== 'verify') {
      throw new Error(`Verification artifact cannot recover stage "${run.stage}".`);
    }
    const transition = await this.#store.transition(run.id, target, this.#now().toISOString());
    if (!transition.ok) {
      throw new Error(transition.reason);
    }
    return {
      status: 'already-completed',
      run: transition.run,
      report,
    };
  }

  async #persist(run: WorkflowRun, report: VerificationReport): Promise<void> {
    await this.#store.writeMarkdown(run, VERIFICATION_MARKDOWN_FILE, renderVerification(report));
    await this.#store.writeJson(run, VERIFICATION_JSON_FILE, report);
  }
}

function requireVerificationWorktree(run: WorkflowRun) {
  if (run.stage !== 'verify') {
    throw new Error(`Verification requires the verify stage; current stage is "${run.stage}".`);
  }
  if (run.worktree?.status !== 'active') {
    throw new Error(`Run "${run.id}" has no active verification worktree.`);
  }
  return run.worktree;
}

async function resolveCommandCwd(
  worktreePath: string,
  configuredCwd: string | undefined,
): Promise<string> {
  const configuredRoot = path.resolve(worktreePath);
  const configuredCandidate = path.resolve(configuredRoot, configuredCwd ?? '.');
  if (!isPathWithin(configuredRoot, configuredCandidate)) {
    throw new Error('Verification cwd is outside the worktree.');
  }
  const root = await realpath(configuredRoot);
  const candidate = await realpath(configuredCandidate);
  if (!isPathWithin(root, candidate)) {
    throw new Error('Verification cwd is outside the worktree.');
  }
  return candidate;
}

function isPathWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
