#!/usr/bin/env node

import { evaluateNodeEntrypoint } from './runtime/index.js';

const result = await evaluateNodeEntrypoint(process.version, async () => {
  await import('dotenv/config');
  const [{ main }, { formatError, writeError }] = await Promise.all([
    import('./index.js'),
    import('./output/index.js'),
  ]);
  return { main, formatError, writeError };
});

if (!result.ok) {
  process.stderr.write(`${result.message}\n`);
  process.exitCode = 1;
} else {
  try {
    process.exitCode = await result.value.main();
  } catch (error: unknown) {
    result.value.writeError(result.value.formatError(error));
    process.exitCode = 1;
  }
}
