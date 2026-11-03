export const PLAN_JSON_FILE = 'plan.json';
export const PLAN_MARKDOWN_FILE = 'plan.md';
export const REVIEW_JSON_FILE = 'review.json';
export const VERIFICATION_JSON_FILE = 'verification.json';
export const SUMMARY_JSON_FILE = 'summary.json';
export const SPECIFICATION_JSON_FILE = 'spec.json';
export const SPECIFICATION_MARKDOWN_FILE = 'spec.md';

export const CLI_EXIT_CODES = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  USAGE_ERROR: 2,
  RUN_NOT_FOUND: 3,
  APPROVAL_REQUIRED: 4,
  BLOCKED: 5,
  FAILED: 6,
  MISSING_ARTIFACT: 7,
} as const;

export const DEFAULT_CODING_AGENT_ID = 'codex';
