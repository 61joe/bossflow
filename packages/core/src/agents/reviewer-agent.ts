import { ReviewResultSchema } from '../contracts/index.js';
import type { ReviewResult } from '../contracts/index.js';
import { redactUnknown } from '../redaction/index.js';
import { AgentBase } from './agent-base.js';
import {
  REVIEWER_AGENT_DESCRIPTION,
  REVIEWER_AGENT_INSTRUCTIONS,
  REVIEWER_AGENT_JSON_INSTRUCTIONS,
  REVIEWER_AGENT_NAME,
} from './constant.js';
import type { GenerateReviewResultOptions, ReviewerAgentInput } from './types.js';

export class ReviewerAgent extends AgentBase<ReviewerAgentInput, ReviewResult> {
  readonly role = 'reviewer' as const;
  readonly name = REVIEWER_AGENT_NAME;
  readonly description = REVIEWER_AGENT_DESCRIPTION;
  readonly outputSchema = ReviewResultSchema;
  protected readonly nativeInstructions = REVIEWER_AGENT_INSTRUCTIONS;
  protected readonly jsonInstructions = REVIEWER_AGENT_JSON_INSTRUCTIONS;

  protected override buildRequest(input: ReviewerAgentInput): string {
    const redactedInput = redactUnknown(input);
    return `Review this implementation against its specification and evidence:\n${JSON.stringify(redactedInput)}`;
  }

  protected override validateInput(input: ReviewerAgentInput): void {
    if (input.verificationEvidence.some((evidence) => !evidence.redacted)) {
      throw new Error('Reviewer verification evidence must be redacted before model execution.');
    }
  }
}

export async function generateReviewResult(
  input: ReviewerAgentInput,
  options: GenerateReviewResultOptions = {},
): Promise<ReviewResult> {
  return new ReviewerAgent(options).execute(input);
}

export function hasBlockingReviewFindings(review: ReviewResult): boolean {
  const unresolved = new Set(review.unresolvedFindingIds);
  return review.findings.some(
    (finding) =>
      unresolved.has(finding.id) && (finding.severity === 'P0' || finding.severity === 'P1'),
  );
}
