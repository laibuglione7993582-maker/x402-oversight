# Contributing

Thanks for your interest. This is an early-stage project — the contribution
surface is intentionally small until the API stabilizes.

## Ways to help right now

- **Report a bug.** Open an issue with a minimal reproduction, the Node
  version, and what you expected to happen.
- **Report a missing feature.** Open an issue with a concrete use case, not
  just "it should support X."
- **Improve the README or types.** Docs PRs are always welcome.

## Running locally

```bash
git clone https://github.com/laibuglione7993582-maker/ledger-agent.git
cd ledger-agent
npm install
npm run build
```

## Code style

- TypeScript strict mode (already configured).
- Prefer small, focused commits. Use conventional prefixes:
  `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`, `perf`.
- Don't add runtime dependencies without discussion — this package is
  intentionally zero-dep.

## PR checklist

- [ ] `npm run build` succeeds locally
- [ ] Changes are reflected in the README if they're user-facing
- [ ] CHANGELOG.md has an entry under `## Unreleased`

## Releases

Maintainers only. We use semver:

1. Bump the version with `npm version patch|minor|major`
2. Push the commit and tag: `git push origin main --tags`
3. Create a GitHub Release from the tag with release notes
4. `npm publish --access public` (2FA required)
