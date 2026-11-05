import type { RetryErrorCode } from './types.js';

export class RetryError extends Error {
  readonly code: RetryErrorCode;

  constructor(message: string, code: RetryErrorCode) {
    super(message);
    this.name = 'RetryError';
    this.code = code;
  }
}
