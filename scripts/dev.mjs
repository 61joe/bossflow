import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const cliPath = path.join(repositoryRoot, 'packages', 'cli', 'dist', 'bin.js');
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const build = spawn(pnpmCommand, ['build'], {
  cwd: repositoryRoot,
  stdio: 'inherit',
});
const [buildExitCode] = await once(build, 'exit');
if (buildExitCode !== 0) {
  process.exitCode = typeof buildExitCode === 'number' ? buildExitCode : 1;
} else {
  const forwardedArgs = process.argv.slice(2);
  if (forwardedArgs[0] === '--') {
    forwardedArgs.shift();
  }
  const cli = spawn(
    process.execPath,
    [cliPath, ...(forwardedArgs.length === 0 ? ['--help'] : forwardedArgs)],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
    },
  );
  const [cliExitCode] = await once(cli, 'exit');
  process.exitCode = typeof cliExitCode === 'number' ? cliExitCode : 1;
}
