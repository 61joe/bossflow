#!/usr/bin/env node

import 'dotenv/config';

import { main } from './index.js';
import { formatError, writeError } from './output/index.js';

try {
  process.exitCode = await main();
} catch (error: unknown) {
  writeError(formatError(error));
  process.exitCode = 1;
}
