## 1. Create e2e package structure

- [x] 1.1 Create `e2e/package.json` with name `@clawmasons/e2e`, private, type: module, devDependencies on vitest, tsx, dotenv, typescript (no explicit chapter dependency since root IS chapter)
- [x] 1.2 Create `e2e/tsconfig.json` with ES2022 target, Node16 module resolution, strict mode
- [x] 1.3 Create `e2e/vitest.config.ts` with 60s test timeout, forks pool, disabled file parallelism, tests/**/*.test.ts include
- [x] 1.4 Create `e2e/.env.example` with OPENROUTER_API_KEY template and E2E_WORKSPACE_DIR override
- [x] 1.5 Create `e2e/.gitignore` with .env, tmp/, node_modules/, dist/
- [x] 1.6 Create empty `e2e/fixtures/test-chapter/` and `e2e/tests/` directories for Change 7 and 8

## 2. Create setup script

- [x] 2.1 Create `e2e/scripts/setup-chapter.ts` that:
  - Creates temp directory at `e2e/tmp/chapter-e2e-<timestamp>/` (configurable via E2E_WORKSPACE_DIR)
  - Removes existing workspace if present (idempotent)
  - Copies fixture packages from `e2e/fixtures/test-chapter/` into workspace dirs
  - Writes root package.json (copies from fixture or generates with workspace config)
  - Runs `npm install`
  - Calls `node bin/chapter.js init` via execFileSync
  - Discovers fixture members by reading package.json files in fixtures/test-chapter/members/
  - Calls `node bin/chapter.js install <member>` for each fixture member
  - Saves workspace path to `e2e/tmp/.last-workspace`
  - Handles missing fixtures gracefully (creates empty structure with message)

## 3. Create teardown script

- [x] 3.1 Create `e2e/scripts/teardown-chapter.ts` that:
  - Reads workspace path from `e2e/tmp/.last-workspace` or E2E_WORKSPACE_DIR env var
  - Discovers docker-compose.yml files in `.chapter/members/` directories
  - Runs `docker compose down --remove-orphans` per member (30s timeout)
  - Removes workspace directory recursively
  - Removes `.last-workspace` tracking file
  - Handles all edge cases: no workspace, already removed, Docker not running

## 4. Update root workspace

- [x] 4.1 Add `"e2e"` to the `workspaces` array in root `package.json` (now: `["chapter-core", "e2e"]`)

## 5. Verify

- [x] 5.1 `npm install` at root succeeds with e2e workspace
- [x] 5.2 `cd e2e && npx tsc --noEmit` passes (e2e package compiles cleanly)
- [x] 5.3 `npx tsc --noEmit` passes (main project unaffected)
- [x] 5.4 `npx eslint src/ tests/` passes (no regressions)
- [x] 5.5 `npx vitest run` passes — 733 tests, 41 test files, 0 failures
- [x] 5.6 `npm run setup` in e2e/ creates a temp workspace with chapter initialized
- [x] 5.7 `npm run teardown` in e2e/ removes the temp workspace cleanly
