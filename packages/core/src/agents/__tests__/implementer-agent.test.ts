import { jest } from '@jest/globals';

import {
  createRuntime,
  IMPLEMENTATION_INPUT,
  IMPLEMENTATION_RESULT,
} from './support/agent-fixtures.js';

jest.unstable_mockModule('@openai/agents', async () => {
  const mock = await import('./support/agent-runtime-mock.js');
  return {
    Agent: mock.MockAgent,
    Runner: mock.MockRunner,
  };
});

const runtimeMock = await import('./support/agent-runtime-mock.js');
const { generateImplementationResult } = await import('../index.js');

describe('generateImplementationResult', () => {
  beforeEach(() => {
    runtimeMock.resetAgentRuntimeMock();
  });

  it('returns a result constrained to approved paths', async () => {
    runtimeMock.queueOutputs(IMPLEMENTATION_RESULT);

    await expect(generateImplementationResult(IMPLEMENTATION_INPUT)).resolves.toEqual(
      IMPLEMENTATION_RESULT,
    );
    expect(runtimeMock.runCalls[0]?.input).toContain('Add role contract tests.');
  });

  it('accepts a blocked result without changed paths', async () => {
    runtimeMock.queueOutputs({
      ...IMPLEMENTATION_RESULT,
      status: 'blocked',
      changedPaths: [],
      notes: ['Required edit is outside the approved scope.'],
    });

    await expect(generateImplementationResult(IMPLEMENTATION_INPUT)).resolves.toMatchObject({
      status: 'blocked',
    });
  });

  it('supports a compatible provider', async () => {
    runtimeMock.queueOutputs(JSON.stringify(IMPLEMENTATION_RESULT));

    await expect(
      generateImplementationResult(IMPLEMENTATION_INPUT, {
        modelRuntime: createRuntime('prompt-json'),
      }),
    ).resolves.toEqual(IMPLEMENTATION_RESULT);
    expect(runtimeMock.agentConfigs[0]).not.toHaveProperty('outputType');
  });

  it('requires approved paths and test expectations', async () => {
    await expect(
      generateImplementationResult({
        ...IMPLEMENTATION_INPUT,
        approvedPaths: [],
      }),
    ).rejects.toThrow('at least one approved path');

    await expect(
      generateImplementationResult({
        ...IMPLEMENTATION_INPUT,
        testExpectations: [],
      }),
    ).rejects.toThrow('at least one test expectation');
  });

  it('rejects approved paths outside the technical plan', async () => {
    await expect(
      generateImplementationResult({
        ...IMPLEMENTATION_INPUT,
        approvedPaths: ['packages/cli'],
      }),
    ).rejects.toThrow('outside the technical plan scope');
  });

  it('rejects reported changes outside the approved scope', async () => {
    runtimeMock.queueOutputs({
      ...IMPLEMENTATION_RESULT,
      changedPaths: ['packages/cli/src/main.ts'],
    });

    await expect(generateImplementationResult(IMPLEMENTATION_INPUT)).rejects.toThrow(
      'outside the approved scope',
    );
  });

  it.each(['', '/absolute', '..', '../escape', 'packages/../escape'])(
    'rejects invalid repository path %s',
    async (invalidPath) => {
      await expect(
        generateImplementationResult({
          ...IMPLEMENTATION_INPUT,
          approvedPaths: [invalidPath],
        }),
      ).rejects.toThrow('Invalid repository path');
    },
  );

  it('normalizes Windows path separators and trailing slashes', async () => {
    runtimeMock.queueOutputs({
      ...IMPLEMENTATION_RESULT,
      changedPaths: ['packages\\core\\src\\agents\\index.ts'],
    });

    await expect(
      generateImplementationResult({
        ...IMPLEMENTATION_INPUT,
        approvedPaths: ['./packages/core/src/agents/'],
      }),
    ).resolves.toMatchObject({ status: 'completed' });
  });
});
