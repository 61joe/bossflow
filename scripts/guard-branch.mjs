import { execFileSync } from 'node:child_process';

const protectedBranches = new Set(['main', 'master']);

let branch;
try {
  branch = execFileSync('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
} catch {
  process.stderr.write('BossFlow: commits from a detached HEAD are not allowed.\n');
  process.exit(1);
}

if (protectedBranches.has(branch)) {
  process.stderr.write(
    `BossFlow: direct commits to "${branch}" are not allowed. ` +
      'Create a feature branch and open a pull request.\n',
  );
  process.exit(1);
}
