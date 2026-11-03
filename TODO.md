# BossFlow TODO

## GitHub Release Automation

- [ ] Create a GitHub fine-grained personal access token scoped only to `61joe/bossflow`.
- [ ] Grant the token `Contents: Read and write` and `Pull requests: Read and write`.
- [ ] Add the token as the repository secret `RELEASE_PR_TOKEN` without posting it in chat:

  ```text
  gh secret set RELEASE_PR_TOKEN --repo 61joe/bossflow
  ```

- [ ] Add a temporary Changeset in a `chore/` PR and merge it to main.
- [ ] Manually trigger the Release PR workflow from `main`:

  ```text
  gh workflow run release-pr.yml --repo 61joe/bossflow --ref main
  ```

- [ ] Verify the manually triggered Release PR workflow creates or updates the `chore/release` PR.
- [ ] Verify `Branch name policy` and CI run automatically without closing or reopening the release PR.
- [ ] Verify the release PR creates a GitHub Release when merged.

## npm Registry

- [ ] Decide whether to publish as `@61joe/bossflow-core` and `@61joe/bossflow-cli`, or use the `@bossflow` npm scope.
- [ ] Select the package license.
- [ ] Authenticate to the npm registry.
- [ ] Change publishable packages from `private: true` after package names and licensing are confirmed.
- [ ] Add npm publish steps to the release workflow.
- [ ] Verify npm publication only after the GitHub Release flow is stable.

## Project Context Extensions

- [ ] Add language-specific default verification commands for Rust, Go, Python, Java, Ruby and PHP projects.
- [ ] Make source scanning honor repository ignore rules and large-monorepo path filters.

## Codex Adapter Installer

- [ ] Add a cross-process file lock for concurrent Codex Skill installs and verify deterministic conflict or idempotent behavior under parallel execution.

## Workflow Verification

- [ ] Decide whether approved technical-plan verification recommendations should remain advisory or be explicitly merged into the persisted project verification profile.
