# Releasing

1. Update `version` in `package.json`, then run `npm install` to update the lockfile.
2. Run `npm run check` and `npm pack --dry-run`, and review the file list.
3. Commit, push, and wait for CI to pass.
4. Tag the commit `v<version>`, push the tag, and publish a GitHub release for it.

The `Publish` workflow then checks that the tag matches `package.json`, runs `npm run check` and publishes to npm with provenance, using npm Trusted Publishing (no token).

## If the workflow cannot publish

npm currently rejects GitHub's token for some new repositories with `403 OIDC permission denied` ([npm/cli#9969](https://github.com/npm/cli/issues/9969)). Until that is fixed, a maintainer publishes from a clean clone of the tag:

```sh
git clone --branch v<version> https://github.com/Papersync/scan-format.git
cd scan-format && npm ci && npm run check
npm publish --access public --provenance=false
```

## Setup (already done)

- npm org `papersync` owns the `@papersync` scope; publishing members use 2FA.
- The package's Trusted Publisher is GitHub Actions: `Papersync/scan-format`, workflow `publish.yml`, no environment.
