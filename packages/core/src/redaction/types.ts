export interface SecretRedactionOptions {
  readonly secrets?: readonly string[];
  readonly replacement?: string;
}

export interface RedactedError {
  readonly name: string;
  readonly message: string;
  readonly cause?: RedactedError | undefined;
}
