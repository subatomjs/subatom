# Contributing to Subatom

Thank you for your interest in contributing to Subatom. This document
describes how to set up your environment and the conventions expected of
pull requests.

## Local Development Setup

Requirements: Node.js `>=24` and npm.

```bash
git clone https://github.com/subatomjs/subatom.git
cd subatom
npm install
```

Useful scripts:

| Script | Purpose |
| --- | --- |
| `npm run dev` | Run `index.ts` in watch mode |
| `npm run cli:dev` | Run the CLI (`start/cli.ts`) in watch mode |
| `npm run typecheck` | Type-check the project with `tsc --noEmit` |
| `npm run lint` | Check formatting/lint rules with Biome |
| `npm run lint-fix` | Auto-fix lint/formatting issues |
| `npm run test` | Run the Vitest suite |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run test:coverage` | Run the full suite with coverage |
| `npm run build` | Clean, type-check, and bundle with `tsdown` |

## Coverage Requirements

This project enforces a **100% coverage threshold** (statements, branches,
functions, and lines) via `vitest.config.ts`. Before opening a pull request:

```bash
npm run test:coverage
```

Any uncovered statement, branch, or line will fail CI. When adding code:

- Prefer extending an existing test file in `tests/**` that matches the
  source file's path before creating a new one.
- Cover both success and failure/edge-case paths (error branches, defaults,
  aborts, etc.) — not just the happy path.

## Type Checking

The codebase enforces a strict **zero `any`** policy. Use precise generics,
explicit interfaces, `unknown` with type guards, or `never` instead. Run:

```bash
npm run typecheck
```

before submitting a pull request.

## Code Style

Formatting and linting are enforced with [Biome](https://biomejs.dev/):

```bash
npm run lint
npm run lint-fix
```

Mirror the existing architectural patterns, naming conventions, and
error-handling structures found in the surrounding code rather than
introducing new patterns.

## Pull Request Conventions

1. Fork the repository and create a feature branch from `main`.
2. Keep changes focused — one logical change per pull request.
3. Ensure `npm run typecheck`, `npm run lint`, and `npm run test:coverage`
   all pass locally before submitting.
4. Write clear, descriptive commit messages (imperative mood, e.g.
   `fix: handle undefined stream backpressure flag`).
5. Update relevant documentation under `docs/` when behavior changes.
6. Describe the motivation and testing performed in the PR description.
7. Be respectful and constructive in review discussions — see our
   [Code of Conduct](./CODE_OF_CONDUCT.md).

## Reporting Issues

Please use the [GitHub issue tracker](https://github.com/subatomjs/subatom/issues)
for bug reports and feature requests. For security concerns, contact
**kunal@subatomjs.dev** directly instead of filing a public issue.
