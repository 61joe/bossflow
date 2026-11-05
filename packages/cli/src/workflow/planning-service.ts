import { readProjectContextDocuments } from '@bossflow/core';
import type {
  DevelopmentSpecification,
  ModelRuntime,
  ProjectContextBundle,
  TechnicalPlan,
  WorkflowRun,
} from '@bossflow/core';

import { renderSpecification } from '../specification/index.js';
import {
  CLI_EXIT_CODES,
  PLAN_JSON_FILE,
  PLAN_MARKDOWN_FILE,
  SPECIFICATION_JSON_FILE,
  SPECIFICATION_MARKDOWN_FILE,
} from './constant.js';
import { WorkflowCliError } from './error.js';
import { renderRepositoryContext, renderTechnicalPlan } from './renderer.js';
import type { PlanningServiceOptions, WorkflowPlanningCoordinator } from './types.js';

export class PlanningService implements WorkflowPlanningCoordinator {
  readonly #store;
  readonly #generateTechnicalPlan;
  readonly #now;

  constructor(options: PlanningServiceOptions) {
    this.#store = options.store;
    this.#generateTechnicalPlan = options.generateTechnicalPlan;
    this.#now = options.now;
  }

  async persistSpecification(
    run: WorkflowRun,
    specification: DevelopmentSpecification,
  ): Promise<void> {
    await this.#store.writeJson(run, SPECIFICATION_JSON_FILE, specification);
    await this.#store.writeMarkdown(
      run,
      SPECIFICATION_MARKDOWN_FILE,
      renderSpecification(specification),
    );
  }

  async generateAndPersistPlan(
    run: WorkflowRun,
    specification: DevelopmentSpecification,
    projectContext: ProjectContextBundle,
    runtime: ModelRuntime,
  ): Promise<{ readonly run: WorkflowRun; readonly plan: TechnicalPlan }> {
    const planStage = await this.#transition(run, 'plan');
    const plan = await this.#generateTechnicalPlan(
      {
        specification,
        repositoryContext: renderRepositoryContext(projectContext),
      },
      { modelRuntime: runtime },
    );
    await this.#store.writeJson(planStage, PLAN_JSON_FILE, plan);
    await this.#store.writeMarkdown(planStage, PLAN_MARKDOWN_FILE, renderTechnicalPlan(plan));
    const approval = await this.#store.transition(
      planStage.id,
      'plan_approval',
      this.#now().toISOString(),
    );
    if (!approval.ok) {
      throw new WorkflowCliError(approval.reason, CLI_EXIT_CODES.GENERAL_ERROR);
    }
    return { run: approval.run, plan };
  }

  async loadProjectContext(run: WorkflowRun): Promise<ProjectContextBundle> {
    const profile = run.projectProfile;
    if (profile === undefined) {
      throw new WorkflowCliError(
        `Run "${run.id}" has no persisted project profile.`,
        CLI_EXIT_CODES.MISSING_ARTIFACT,
      );
    }
    const documents = await readProjectContextDocuments(profile.repositoryRoot, [
      ...profile.planningContextFiles,
      ...profile.testConfigFiles,
    ]);
    return { profile, documents };
  }

  async #transition(run: WorkflowRun, stage: WorkflowRun['stage']): Promise<WorkflowRun> {
    const transition = await this.#store.transition(run.id, stage, this.#now().toISOString());
    if (!transition.ok) {
      throw new WorkflowCliError(transition.reason, CLI_EXIT_CODES.GENERAL_ERROR);
    }
    return transition.run;
  }
}
