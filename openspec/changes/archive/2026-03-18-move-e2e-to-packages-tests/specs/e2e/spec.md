## MODIFIED Requirements

### Requirement: CLI-only testing
E2E tests SHALL invoke the `mason` CLI binary exclusively. Tests MUST NOT import internal APIs from `packages/cli/src/`, `packages/proxy/src/`, or `packages/shared/src/`. The only imports allowed from the monorepo are type-only imports if strictly necessary.

**Rationale:** E2E tests verify the CLI's public contract — exit codes, stdout, generated files, and running containers. Internal function behavior is covered by unit tests in `packages/*/tests/`.

#### Scenario: No internal imports
- **WHEN** any file in `packages/tests/tests/` is scanned for import paths matching `../../packages/`
- **THEN** zero matches are found

#### Scenario: No resolve aliases needed
- **GIVEN** `packages/tests/vitest.config.ts`
- **THEN** it contains no `resolve.alias` entries for `@clawmasons/*` packages

### Requirement: Shared test helpers
Common test operations SHALL be extracted to `packages/tests/tests/helpers.ts` to eliminate duplication across test files. Required helpers:

| Helper | Purpose |
|--------|---------|
| `copyFixtureWorkspace(name, opts?)` | Copy fixtures to temp dir, optionally excluding paths |
| `masonExec(args, cwd, opts?)` | Run `mason` CLI, return stdout |
| `masonExecJson<T>(args, cwd)` | Run `mason` with `--json`, parse output |
| `waitForHealth(url, timeout, diagnostics?)` | Poll health endpoint with Docker log diagnostics on failure |
| `isDockerAvailable()` | Check Docker daemon availability |

`MASON_BIN` SHALL resolve to `scripts/mason.js` at the monorepo root (not `bin/mason.js`).

#### Scenario: Helper functions available
- **WHEN** any E2E test file imports from `./helpers`
- **THEN** `masonExec`, `masonExecJson`, `copyFixtureWorkspace`, `waitForHealth`, and `isDockerAvailable` are available

#### Scenario: MASON_BIN resolves correctly
- **GIVEN** the helpers module is loaded from `packages/tests/tests/helpers.ts`
- **WHEN** `MASON_BIN` is evaluated
- **THEN** it resolves to `<monorepo-root>/scripts/mason.js`

## MODIFIED Requirements

### Requirement: Verification commands use packages/tests path

Verification commands for this spec SHALL reference `packages/tests/` as the suite root.

#### Scenario: Run E2E suite
- **WHEN** the command `cd packages/tests && npx vitest run` is executed from the monorepo root
- **THEN** all E2E tests run and pass (44+ tests, 2 skipped)

#### Scenario: No-internal-imports check
- **WHEN** the command `grep -r "../../packages/" packages/tests/tests/` is run
- **THEN** it exits with a non-zero code (zero matches found)
