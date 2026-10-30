export interface AdapterDescriptor {
  readonly id: string;
  readonly displayName: string;
  readonly invocation: string;
}

export interface CodingAgentAdapter {
  describe(): AdapterDescriptor;
}
