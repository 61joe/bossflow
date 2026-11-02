import { ImplementationResultSchema } from '../contracts/index.js';
import type { ImplementationResult } from '../contracts/index.js';
import { AgentBase } from './agent-base.js';
import {
  IMPLEMENTER_AGENT_DESCRIPTION,
  IMPLEMENTER_AGENT_INSTRUCTIONS,
  IMPLEMENTER_AGENT_JSON_INSTRUCTIONS,
  IMPLEMENTER_AGENT_NAME,
} from './constant.js';
import type { GenerateImplementationResultOptions, ImplementationAgentInput } from './types.js';

export class ImplementerAgent extends AgentBase<ImplementationAgentInput, ImplementationResult> {
  readonly role = 'implementer' as const;
  readonly name = IMPLEMENTER_AGENT_NAME;
  readonly description = IMPLEMENTER_AGENT_DESCRIPTION;
  readonly outputSchema = ImplementationResultSchema;
  protected readonly nativeInstructions = IMPLEMENTER_AGENT_INSTRUCTIONS;
  protected readonly jsonInstructions = IMPLEMENTER_AGENT_JSON_INSTRUCTIONS;

  protected override buildRequest(input: ImplementationAgentInput): string {
    return `Produce the implementation result for this approved workflow input:\n${JSON.stringify(input)}`;
  }

  protected override validateInput(input: ImplementationAgentInput): void {
    if (input.approvedPaths.length === 0) {
      throw new Error('Implementation requires at least one approved path.');
    }
    if (input.testExpectations.length === 0) {
      throw new Error('Implementation requires at least one test expectation.');
    }
    for (const approvedPath of input.approvedPaths) {
      if (!input.plan.affectedPaths.some((planPath) => isPathWithinScope(approvedPath, planPath))) {
        throw new Error(`Approved path "${approvedPath}" is outside the technical plan scope.`);
      }
    }
  }

  protected override validateOutput(
    result: ImplementationResult,
    input: ImplementationAgentInput,
  ): void {
    for (const changedPath of result.changedPaths) {
      if (
        !input.approvedPaths.some((approvedPath) => isPathWithinScope(changedPath, approvedPath))
      ) {
        throw new Error(`Implementation changed path "${changedPath}" outside the approved scope.`);
      }
    }
  }
}

export async function generateImplementationResult(
  input: ImplementationAgentInput,
  options: GenerateImplementationResultOptions = {},
): Promise<ImplementationResult> {
  return new ImplementerAgent(options).execute(input);
}

function isPathWithinScope(candidate: string, scope: string): boolean {
  const normalizedCandidate = normalizeRepositoryPath(candidate);
  const normalizedScope = normalizeRepositoryPath(scope);
  return (
    normalizedCandidate === normalizedScope || normalizedCandidate.startsWith(`${normalizedScope}/`)
  );
}

function normalizeRepositoryPath(value: string): string {
  const portablePath = value.replaceAll('\\', '/');
  if (
    portablePath.length === 0 ||
    portablePath.startsWith('/') ||
    /^[a-zA-Z]:\//.test(portablePath) ||
    portablePath.includes('\0')
  ) {
    throw new Error(`Invalid repository path "${value}".`);
  }

  const segments = portablePath.split('/').filter((segment) => segment !== '' && segment !== '.');
  if (segments.length === 0 || segments.includes('..')) {
    throw new Error(`Invalid repository path "${value}".`);
  }
  return segments.join('/');
}
