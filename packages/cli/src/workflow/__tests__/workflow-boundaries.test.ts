import { readFile } from 'node:fs/promises';
import path from 'node:path';

const WORKFLOW_DIRECTORY = path.resolve(import.meta.dirname, '..');
const INTERNAL_SERVICES = [
  'approval-service.ts',
  'plan-verification-policy.ts',
  'planning-service.ts',
  'resume-pipeline.ts',
  'retry-service.ts',
  'run-evidence.ts',
  'status-service.ts',
  'workflow-error-mapper.ts',
] as const;

describe('workflow service boundaries', () => {
  it('keeps the facade small and free of file-level lint exceptions', async () => {
    const content = await readFile(path.join(WORKFLOW_DIRECTORY, 'workflow-service.ts'), 'utf8');
    expect(content.trimEnd().split('\n').length).toBeLessThan(200);
    expect(content).not.toContain('eslint-disable max-lines');
  });

  it('keeps internal services from importing the facade', async () => {
    for (const fileName of INTERNAL_SERVICES) {
      const content = await readFile(path.join(WORKFLOW_DIRECTORY, fileName), 'utf8');
      expect(content).not.toContain('workflow-service.js');
    }
  });
});
