# Contributing to RAW Studio

Thanks for your interest in improving RAW Studio! This project is a fully
client-side RAW developer that must keep running on GitHub Pages with **no
server, no API and no database**. Please keep that constraint in mind for every
change.

## Ground rules

- **Browser-only.** No feature may depend on a backend, Node runtime, or paid
  cloud service. If a library needs a server, it will not be accepted.
- **GitHub Pages must keep working.** Cross-origin isolation, base-path and
  bundle-size constraints all matter — see the README.
- **TypeScript strict, no `any`.** `npm run typecheck` and `npm run lint` must
  pass with zero errors. No TODOs, stubs, or dead code in merged PRs.

## Getting started

```bash
npm install
npm run dev        # local dev server (COOP/COEP headers set automatically)
npm run test       # Vitest
npm run typecheck  # tsc, strict
npm run lint       # ESLint, no-explicit-any enforced
npm run build      # production build
```

## Making a change

1. Fork and create a feature branch: `git checkout -b feat/short-name`.
2. Keep the build green at every commit (`npm run build` must pass).
3. Add or update tests for any logic change.
4. Run `npm run format` before committing.
5. Open a PR using the template and describe the change and how you tested it.

## Commit style

Use [Conventional Commits](https://www.conventionalcommits.org/):
`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `perf:`.

## Architecture

The codebase is feature-first. Shared domain types live in `src/types`;
each feature under `src/features/<name>` exposes a public API through its
`index.ts`. Please import features through their barrel, not by deep path.
