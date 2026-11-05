import { createHash } from 'node:crypto';

import {
  DevelopmentSpecificationSchema,
  ReviewResultSchema,
  TechnicalPlanSchema,
  VerificationReportSchema,
  findActiveArtifact,
  findActiveArtifactByFileName,
} from '@bossflow/core';
import type {
  ArtifactKind,
  ArtifactReference,
  DevelopmentSpecification,
  ReviewResult,
  TechnicalPlan,
  VerificationReport,
  WorkflowRun,
} from '@bossflow/core';

import {
  CLI_EXIT_CODES,
  PLAN_JSON_FILE,
  REVIEW_JSON_FILE,
  SPECIFICATION_JSON_FILE,
  VERIFICATION_JSON_FILE,
} from './constant.js';
import { WorkflowCliError } from './error.js';
import type { RunEvidenceOptions, WorkflowEvidenceReader } from './types.js';
import { isMissingRunError } from './workflow-error-mapper.js';

export class RunEvidence implements WorkflowEvidenceReader {
  readonly #store;

  constructor(options: RunEvidenceOptions) {
    this.#store = options.store;
  }

  async readRun(runId: string): Promise<WorkflowRun> {
    try {
      return await this.#store.read(runId);
    } catch (error: unknown) {
      if (isMissingRunError(error)) {
        throw new WorkflowCliError(
          `Run "${runId}" was not found.`,
          CLI_EXIT_CODES.RUN_NOT_FOUND,
          'Check the run ID or list artifacts under .bossflow/runs.',
          error,
        );
      }
      throw error;
    }
  }

  async readSpecification(run: WorkflowRun): Promise<DevelopmentSpecification> {
    const content = await this.readRequiredArtifact(run, SPECIFICATION_JSON_FILE);
    return DevelopmentSpecificationSchema.parse(JSON.parse(content));
  }

  async readTechnicalPlan(run: WorkflowRun): Promise<TechnicalPlan | undefined> {
    const content = await this.readOptionalArtifact(run, PLAN_JSON_FILE);
    return content === undefined ? undefined : TechnicalPlanSchema.parse(JSON.parse(content));
  }

  async readVerification(run: WorkflowRun): Promise<VerificationReport | undefined> {
    const content = await this.readOptionalArtifact(run, VERIFICATION_JSON_FILE);
    return content === undefined ? undefined : VerificationReportSchema.parse(JSON.parse(content));
  }

  async readReview(run: WorkflowRun): Promise<ReviewResult | undefined> {
    const content = await this.readOptionalArtifact(run, REVIEW_JSON_FILE);
    return content === undefined ? undefined : ReviewResultSchema.parse(JSON.parse(content));
  }

  async readRequiredArtifact(run: WorkflowRun, fileName: string): Promise<string> {
    const content = await this.readOptionalArtifact(run, fileName);
    if (content === undefined) {
      throw new WorkflowCliError(
        `Run "${run.id}" is missing required artifact "${fileName}".`,
        CLI_EXIT_CODES.MISSING_ARTIFACT,
      );
    }
    return content;
  }

  async readOptionalArtifact(run: WorkflowRun, fileName: string): Promise<string | undefined> {
    const artifact = findActiveArtifactByFileName(run, fileName);
    if (artifact === undefined) {
      return undefined;
    }
    const content = await this.#store.readText(run, fileName);
    const sha256 = createHash('sha256').update(content).digest('hex');
    if (sha256 !== artifact.sha256) {
      throw new WorkflowCliError(
        `Artifact "${fileName}" has been modified.`,
        CLI_EXIT_CODES.FAILED,
      );
    }
    return content;
  }

  requireArtifact(run: WorkflowRun, fileName: string, kind: ArtifactKind): ArtifactReference {
    const artifact = this.findArtifact(run, fileName, kind);
    if (artifact?.sha256 === undefined) {
      throw new WorkflowCliError(
        `Run "${run.id}" has no current "${fileName}" artifact.`,
        CLI_EXIT_CODES.MISSING_ARTIFACT,
        `Regenerate the stage before approving it.`,
      );
    }
    return artifact;
  }

  findArtifact(
    run: WorkflowRun,
    fileName: string,
    kind: ArtifactKind,
  ): ArtifactReference | undefined {
    return findActiveArtifact(run, kind, fileName);
  }
}
