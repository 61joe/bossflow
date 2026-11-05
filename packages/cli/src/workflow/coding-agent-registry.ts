import { CodexAdapter } from '@bossflow/adapters';
import type {
  AdapterDescriptor,
  CodingAgentAdapter,
  CodingAgentSkillInstaller,
  CodingAgentSkillInstallOptions,
  CodingAgentSkillInstallResult,
  WorktreeImplementer,
} from '@bossflow/core';

type RegisteredCodingAgentAdapter = CodingAgentAdapter & Partial<CodingAgentSkillInstaller>;

export class CodingAgentRegistry {
  readonly #adapters = new Map<string, RegisteredCodingAgentAdapter>();

  register(adapter: RegisteredCodingAgentAdapter): this {
    const normalizedId = adapter.describe().id.trim();
    if (normalizedId.length === 0) {
      throw new Error('Coding Agent adapter ID must not be empty.');
    }
    if (this.#adapters.has(normalizedId)) {
      throw new Error(`Coding Agent adapter "${normalizedId}" is already registered.`);
    }
    this.#adapters.set(normalizedId, adapter);
    return this;
  }

  has(adapterId: string): boolean {
    return this.#adapters.has(adapterId.trim());
  }

  describe(adapterId: string): AdapterDescriptor {
    return this.#require(adapterId).describe();
  }

  createImplementer(adapterId: string): WorktreeImplementer {
    return this.#require(adapterId).createWorktreeImplementer();
  }

  supportsSkillInstallation(adapterId: string): boolean {
    return typeof this.#require(adapterId).installSkill === 'function';
  }

  installSkill(
    adapterId: string,
    options: CodingAgentSkillInstallOptions,
  ): Promise<CodingAgentSkillInstallResult> {
    const adapter = this.#require(adapterId);
    if (adapter.installSkill === undefined) {
      throw new Error(`Coding Agent adapter "${adapterId.trim()}" does not install Skills.`);
    }
    return adapter.installSkill(options);
  }

  #require(adapterId: string): RegisteredCodingAgentAdapter {
    const normalizedId = adapterId.trim();
    const adapter = this.#adapters.get(normalizedId);
    if (adapter === undefined) {
      throw new Error(`Coding Agent adapter "${normalizedId}" is not registered.`);
    }
    return adapter;
  }
}

export function createDefaultCodingAgentRegistry(): CodingAgentRegistry {
  return new CodingAgentRegistry().register(new CodexAdapter());
}
