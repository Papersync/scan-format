# Releasing

1. Update the npm version in `package.json` and `package-lock.json`. Incompatible 0.x API changes use the next minor; the persisted format version changes independently.
2. From a clean checkout, run `npm ci --ignore-scripts`, `npm run check`, and `npm run check:pack`. Review `.pack/pack.json`, the declarations, and the README against the exported API.
3. Commit to `main`, push, and wait for CI. Tag that commit `v<version>`, push the tag, and publish a GitHub release for it.

The Publish build job verifies the tag, requires main ancestry, checks signatures and the validator/toolchain audit, runs tests, and validates the packed package. It uploads the tested tarball, its SHA-256 checksum, and npm 11.9.0. The separate single-step publish job verifies the artifact digest and checksum and publishes that tarball with scripts disabled and provenance enabled. Only that job has OIDC permission. It requires Node 24 in the hosted runner tool cache.

If the Publish workflow is rejected, check the npm Trusted Publisher settings (org, repo, workflow file, allowed actions). As a fallback, publish manually from a clean clone of the tag with `--provenance=false`:

```sh
git clone --branch v<version> https://github.com/Papersync/scan-format.git
cd scan-format
npm ci --ignore-scripts
npm run check
npm run check:pack
npm exec --yes --package=npm@11.9.0 -- npm publish .pack/papersync-scan-format-<version>.tgz --ignore-scripts --access public --provenance=false
```

Compare the local tarball checksum with the verified workflow artifact before manual publication. Record the tag, commit, tarball checksum, and whether provenance was used in the release notes.
