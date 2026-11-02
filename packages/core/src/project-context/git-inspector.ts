import path from 'node:path';

import { GitError, simpleGit } from 'simple-git';

import type {
  GitCommandClient,
  GitCommandClientFactory,
  GitRepositoryInfo,
  ProjectGitStatus,
} from './types.js';

export class GitRepositoryInspector {
  readonly #gitFactory: GitCommandClientFactory;

  constructor(gitFactory: GitCommandClientFactory = createSimpleGitClient) {
    this.#gitFactory = gitFactory;
  }

  async inspect(candidatePath: string): Promise<GitRepositoryInfo> {
    const git = this.#gitFactory(candidatePath);
    let repositoryRoot: string;
    try {
      repositoryRoot = path.resolve((await git.revparse(['--show-toplevel'])).trim());
    } catch (error: unknown) {
      if (!isNotRepositoryError(error)) {
        throw error;
      }
      return {
        repositoryRoot: path.resolve(candidatePath),
        status: {
          isRepository: false,
          status: 'not-repository',
          changedPaths: [],
        },
      };
    }

    const status = await this.#gitFactory(repositoryRoot).status();
    const projectStatus: ProjectGitStatus = {
      isRepository: true,
      status: status.files.length === 0 ? 'clean' : 'dirty',
      changedPaths: status.files.map((file) => file.path),
      ...(status.current === null || status.current === 'HEAD' ? {} : { branch: status.current }),
    };
    return {
      repositoryRoot,
      status: projectStatus,
    };
  }
}

function createSimpleGitClient(candidatePath: string): GitCommandClient {
  const git = simpleGit(candidatePath);
  return {
    revparse: (args) => git.revparse([...args]),
    status: () => git.status(),
  };
}

export function isNotRepositoryError(error: unknown): boolean {
  return error instanceof GitError && /not a git repository/i.test(error.message);
}
