export function writeLine(message: string): void {
  process.stdout.write(`${message}\n`);
}

export function writeError(message: string): void {
  process.stderr.write(`${message}\n`);
}

export function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
