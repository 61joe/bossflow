export const DEFAULT_REDACTION_REPLACEMENT = '[REDACTED]';
export const MAX_REDACTION_DEPTH = 12;

export const BEARER_TOKEN_PATTERN = /\b(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi;
export const SECRET_ASSIGNMENT_PATTERN =
  /\b(api[_-]?key|access[_-]?token|auth[_-]?token|token|secret|password)\b(\s*[:=]\s*)(["']?)([^\s"'`]+)/gi;
export const KNOWN_TOKEN_PATTERN = /\b(?:sk|rk|pk|npm|gh[pousr])[_-][A-Za-z0-9_-]{8,}\b/gi;
