import type { ApprovalAction, PackageManager, ReviewFinding, WorkflowStage } from '@bossflow/core';

export type ConformanceScenarioId =
  'single-js-export' | 'single-js-function' | 'multi-package-js-export';

export type ConformanceProjectProfileId = 'single-package-javascript' | 'multi-package-javascript';

export interface ConformanceScenario {
  readonly id: ConformanceScenarioId;
  readonly projectProfile: ConformanceProjectProfileId;
  readonly packageManager: PackageManager;
  readonly languages: readonly string[];
  readonly goal: string;
  readonly expectedChangedPath: string;
  readonly files: Readonly<Record<string, string>>;
}

export interface ConformanceVerificationRecord {
  readonly commandId: string;
  readonly status: 'passed' | 'failed' | 'skipped';
  readonly exitCode?: number | undefined;
}

export interface ConformanceReviewFinding {
  readonly id: string;
  readonly severity: ReviewFinding['severity'];
  readonly title: string;
  readonly status: ReviewFinding['status'];
  readonly verificationCommandId?: string | undefined;
}

export interface ConformanceReport {
  readonly schemaVersion: 1;
  readonly adapterId: 'codex';
  readonly scenarioId: ConformanceScenarioId;
  readonly projectProfile: {
    readonly id: ConformanceProjectProfileId;
    readonly packageManager: PackageManager;
    readonly languages: readonly string[];
  };
  readonly runId: string;
  readonly stage: WorkflowStage;
  readonly outcome: 'completed' | 'blocked' | 'failed';
  readonly firstIncompleteStage?: WorkflowStage | undefined;
  readonly changedPaths: readonly string[];
  readonly verification: readonly ConformanceVerificationRecord[];
  readonly reviewFindings: readonly ConformanceReviewFinding[];
  readonly userInterventions: readonly string[];
  readonly authorizedExternalActions: readonly ApprovalAction[];
  readonly artifactHashes: Readonly<Record<string, string>>;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly failureMessage?: string | undefined;
}

export interface BuildConformanceReportOptions {
  readonly runId: string;
  readonly runsRoot: string;
  readonly scenario: ConformanceScenario;
  readonly now?: () => Date;
  readonly secrets?: readonly string[];
  readonly failureMessage?: string | undefined;
}

export interface WriteConformanceReportOptions {
  readonly report: ConformanceReport;
  readonly outputDirectory: string;
}

export interface FinalizeConformanceFixtureOptions {
  readonly fixtureRoot: string;
  readonly worktreesRoot: string;
  readonly credentialsPath: string;
  readonly outcome: ConformanceReport['outcome'];
  readonly keepOnFailure: boolean;
}

export interface ConformanceFixtureCleanupResult {
  readonly retained: boolean;
}
