import { ImplementerAgent } from './implementer-agent.js';
import { ProductAgent } from './product-agent.js';
import { ReviewerAgent } from './reviewer-agent.js';
import { TechLeadAgent } from './tech-lead-agent.js';
import type { AgentBaseOptions } from './types.js';

export class AgentRegistry {
  readonly product: ProductAgent;
  readonly techLead: TechLeadAgent;
  readonly implementer: ImplementerAgent;
  readonly reviewer: ReviewerAgent;

  constructor(options: AgentBaseOptions = {}) {
    this.product = new ProductAgent(options);
    this.techLead = new TechLeadAgent(options);
    this.implementer = new ImplementerAgent(options);
    this.reviewer = new ReviewerAgent(options);
  }

  supportsAgentTools(): boolean {
    return [this.product, this.techLead, this.implementer, this.reviewer].every(
      (agent) => typeof agent.asTool === 'function',
    );
  }
}
