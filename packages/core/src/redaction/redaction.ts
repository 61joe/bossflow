import {
  BEARER_TOKEN_PATTERN,
  DEFAULT_REDACTION_REPLACEMENT,
  KNOWN_TOKEN_PATTERN,
  MAX_REDACTION_DEPTH,
  SECRET_ASSIGNMENT_PATTERN,
} from './constant.js';
import type { RedactedError, SecretRedactionOptions } from './types.js';

export function redactText(input: string, options: SecretRedactionOptions = {}): string {
  const replacement = options.replacement ?? DEFAULT_REDACTION_REPLACEMENT;
  let result = input;

  for (const secret of [...(options.secrets ?? [])].sort(
    (left, right) => right.length - left.length,
  )) {
    if (secret.length > 0) {
      result = result.split(secret).join(replacement);
    }
  }

  result = result.replace(BEARER_TOKEN_PATTERN, `$1${replacement}`);
  result = result.replace(
    SECRET_ASSIGNMENT_PATTERN,
    (_match, key: string, separator: string, quote: string) =>
      `${key}${separator}${quote}${replacement}`,
  );
  result = result.replace(KNOWN_TOKEN_PATTERN, replacement);
  return result;
}

export function redactUnknown(value: unknown, options: SecretRedactionOptions = {}): unknown {
  return redactValue(value, options, 0);
}

export function redactError(error: unknown, options: SecretRedactionOptions = {}): RedactedError {
  return redactErrorValue(error, options, 0, new WeakSet());
}

function redactErrorValue(
  error: unknown,
  options: SecretRedactionOptions,
  depth: number,
  seen: WeakSet<object>,
): RedactedError {
  if (!isRecord(error)) {
    return {
      name: 'Error',
      message: redactText(String(error), options),
    };
  }
  if (depth >= MAX_REDACTION_DEPTH) {
    return {
      name: 'Error',
      message: '[MAX_CAUSE_DEPTH]',
    };
  }
  if (seen.has(error)) {
    return {
      name: 'Error',
      message: '[CIRCULAR_CAUSE]',
    };
  }

  seen.add(error);
  const name = typeof error.name === 'string' ? error.name : 'Error';
  const message = typeof error.message === 'string' ? error.message : String(error);
  const cause = 'cause' in error ? error.cause : undefined;
  const result: RedactedError = {
    name,
    message: redactText(message, options),
    ...(cause === undefined ? {} : { cause: redactErrorValue(cause, options, depth + 1, seen) }),
  };
  seen.delete(error);
  return result;
}

function redactValue(value: unknown, options: SecretRedactionOptions, depth: number): unknown {
  if (typeof value === 'string') {
    return redactText(value, options);
  }
  if (depth >= MAX_REDACTION_DEPTH) {
    return '[MAX_DEPTH]';
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry, options, depth + 1));
  }
  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, redactValue(entry, options, depth + 1)]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
