## Why

The existing test suite validates the chapter framework's internals -- schema parsing, graph resolution, materialization, Docker Compose generation. All of these are unit tests run in isolation. What's missing is validation that the full lifecycle works: can a test chapter be created from fixtures, can members be installed via the real `chapter install` pipeline, and do the materialized outputs actually contain correct files?

The pi-coding-agent materializer is now fully implemented and registered (Changes 1-5), but there is no E2E test infrastructure to exercise it against a real chapter workspace. The `e2e/` package fills this gap by providing:

1. A standalone package with its own TypeScript config, vitest, and dotenv setup
2. Setup/teardown scripts that create and destroy temporary test chapters
3. A foundation for E2E tests that exercise materialization and (later) live API interactions

This change covers the package setup and scripts only. Test fixtures and test suites are separate changes (7 and 8).

## What Changes

- **New `e2e/` directory** at the project root with:
  - `package.json` — private package, type: module, vitest + tsx + dotenv devDependencies (chapter is available via workspace symlink, no explicit dependency needed since the root IS the chapter package)
  - `tsconfig.json` — TypeScript config matching project conventions (ES2022, Node16, strict)
  - `vitest.config.ts` — test runner configuration (60s timeout, forks pool, no file parallelism)
  - `.env.example` — template for required API keys (OPENROUTER_API_KEY)
  - `.gitignore` — ignore `.env`, `tmp/`, `node_modules/`, `dist/`
  - `scripts/setup-chapter.ts` — creates temp workspace, copies fixtures, runs init + install via chapter CLI binary
  - `scripts/teardown-chapter.ts` — stops Docker Compose, removes temp workspace

- **Root `package.json`** — add `"e2e"` to the `workspaces` array

## Capabilities

### New Capabilities
- `e2e-package`: Standalone E2E testing package with TypeScript, vitest, and dotenv
- `e2e-setup-script`: Script to create a temporary test chapter from fixture packages
- `e2e-teardown-script`: Script to clean up test chapters (Docker stop + directory removal)

### Modified Capabilities
- `root-workspace`: Root package.json now includes `e2e` in workspaces array

## Impact

- **New:** `e2e/package.json` — package configuration
- **New:** `e2e/tsconfig.json` — TypeScript config
- **New:** `e2e/vitest.config.ts` — vitest test runner config
- **New:** `e2e/.env.example` — API key template
- **New:** `e2e/.gitignore` — ignore .env and tmp/
- **New:** `e2e/scripts/setup-chapter.ts` — chapter setup script
- **New:** `e2e/scripts/teardown-chapter.ts` — chapter teardown script
- **Modified:** `package.json` (root) — add "e2e" to workspaces array
- **No new production dependencies**
