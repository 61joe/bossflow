import type { ModelRuntime } from '../models/index.js';

export interface DevelopmentSpecification {
  readonly title: string;
  readonly problem: string;
  readonly scope: readonly string[];
  readonly nonGoals: readonly string[];
  readonly acceptanceCriteria: readonly string[];
  readonly constraints: readonly string[];
}

export interface GenerateSpecificationOptions {
  readonly modelRuntime?: ModelRuntime;
}

export interface ModelProbeResult {
  readonly status: 'ok';
  readonly message: string;
}
