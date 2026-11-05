import type { NodeEntrypointResult } from './types.js';

const MINIMUM_NODE_MAJOR = 24;

export async function evaluateNodeEntrypoint<T>(
  version: string,
  load: () => Promise<T>,
): Promise<NodeEntrypointResult<T>> {
  const node = inspectNodeVersion(version);
  if (!node.supported) {
    return { ok: false, message: node.message };
  }
  return { ok: true, value: await load() };
}

export function inspectNodeVersion(version: string): {
  readonly supported: boolean;
  readonly message: string;
} {
  const major = parseNodeMajor(version);
  if (major === undefined || major < MINIMUM_NODE_MAJOR) {
    return {
      supported: false,
      message:
        `BossFlow requires Node.js >=${MINIMUM_NODE_MAJOR}; detected ${version}. ` +
        `Switch to Node.js ${MINIMUM_NODE_MAJOR} or newer and run the command again.`,
    };
  }
  return {
    supported: true,
    message: `Node.js ${version} satisfies >=${MINIMUM_NODE_MAJOR}.`,
  };
}

function parseNodeMajor(version: string): number | undefined {
  const match = /^v?(\d+)\.\d+\.\d+$/u.exec(version.trim());
  if (match?.[1] === undefined) {
    return undefined;
  }
  return Number.parseInt(match[1], 10);
}
