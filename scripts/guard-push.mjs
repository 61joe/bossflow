const protectedRefs = new Set(['refs/heads/main', 'refs/heads/master']);

let input = '';
for await (const chunk of process.stdin) {
  input += chunk;
}

const protectedTarget = input
  .split(/\r?\n/)
  .filter((line) => line.length > 0)
  .map((line) => line.split(/\s+/))
  .find((parts) => protectedRefs.has(parts[2]));

if (protectedTarget !== undefined) {
  process.stderr.write(
    `BossFlow: direct pushes to "${protectedTarget[2].replace('refs/heads/', '')}" ` +
      'are not allowed. Push a feature branch and open a pull request.\n',
  );
  process.exit(1);
}
