# Contributing

## Development Setup

```bash
pnpm install   # install dependencies
pnpm check     # format + lint + typecheck
pnpm test      # browser-mode tests (requires playwright chromium)
```

## Testing conventions

Tests that import from the default entry (`../src/index.ts`) get per-file GPU
renderer cleanup automatically — the entry registers `afterAll(disposeRenderer)`
on import. Do **not** add hand-written `afterAll` blocks in those files.

Manual cleanup is only needed when importing from the side-effect-free
`vitest-browser-three/pure`: either register `afterAll(disposeRenderer)`
yourself or use a Vitest setup file (see the Cleanup section in README.md).

## Release process

Releases are performed manually by maintainers:

1. Bump the version (interactively picks the release type, updates
   `package.json`, and creates a commit):

   ```bash
   vp exec bumpp
   ```

2. Build and publish (`prepublishOnly` builds automatically):

   ```bash
   vp run build
   npm publish --access public
   ```

3. Create a git tag and push it:

   ```bash
   git tag "v$(jq -r .version package.json)"
   git push origin --tags
   ```

   For release notes, `npx changelogithub` can be used if desired.
