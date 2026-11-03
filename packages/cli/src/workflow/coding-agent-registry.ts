import type { WorktreeImplementer } from '@bossflow/core';

import { createCodexWorktreeImplementer } from './codex-implementer.js';
import { DEFAULT_CODING_AGENT_ID } from './constant.js';
import type { CodingAgentImplementerFactory } from './types.js';

export class CodingAgentRegistry {
  readonly #factories = new Map<string, CodingAgentImplementerFactory>();

  register(adapterId: string, factory: CodingAgentImplementerFactory): this {
    const normalizedId = adapterId.trim();
    if (normalizedId.length === 0) {
      throw new Error('Coding Agent adapter ID must not be empty.');
    }
    if (this.#factories.has(normalizedId)) {
      throw new Error(`Coding Agent adapter "${normalizedId}" is already registered.`);
    }
    this.#factories.set(normalizedId, factory);
    return this;
  }

  create(adapterId: string): WorktreeImplementer {
    const normalizedId = adapterId.trim();
    const factory = this.#factories.get(normalizedId);
    if (factory === undefined) {
      throw new Error(`Coding Agent adapter "${normalizedId}" is not registered.`);
    }
    return factory();
  }
}

export function createDefaultCodingAgentRegistry(): CodingAgentRegistry {
  return new CodingAgentRegistry().register(
    DEFAULT_CODING_AGENT_ID,
    createCodexWorktreeImplementer,
  );
}
