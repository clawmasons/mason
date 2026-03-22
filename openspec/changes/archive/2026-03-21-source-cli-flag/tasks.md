## 1. Add `resolveDialectName()` to dialect-registry.ts

- [x] 1.1 Add `resolveDialectName(input: string): string | undefined` function that normalizes `.claude` / `claude` / `claude-code-agent` to the registry key
- [x] 1.2 Export `resolveDialectName` from `packages/shared/src/role/index.ts` and `packages/shared/src/index.ts`

## 2. Add `--source` Flag to Run Command

- [x] 2.1 Import `Option` from `commander` in `run-agent.ts`
- [x] 2.2 Create `sourceOption` using `new Option("--source <name>", ...)` with `.argParser()` collecting into an array
- [x] 2.3 Add `.addOption(sourceOption)` to the run command in `registerRunCommand()`
- [x] 2.4 Add `source?: string[]` to the options type in `createRunAction()`

## 3. Add Source Validation and Normalization

- [x] 3.1 Import `resolveDialectName` and `getKnownDirectories` from `@clawmasons/shared` in `run-agent.ts`
- [x] 3.2 Add exported `normalizeSourceFlags(sources: string[]): string[]` function
- [x] 3.3 In `createRunAction()`, after agent type resolution, validate/normalize `--source` values and compute `sourceOverride`

## 4. Thread Source Override to Mode Functions

- [x] 4.1 Add `sourceOverride?: string[]` to the `runAgent()` options parameter
- [x] 4.2 Pass `sourceOverride` from `createRunAction()` into `runAgent()` calls
- [x] 4.3 Thread `sourceOverride` from `runAgent()` to each mode function (`runAgentInteractiveMode`, `runAgentDevContainerMode`, `runAgentAcpMode`)
- [x] 4.4 In each mode function, apply `if (sourceOverride?.length) roleType.sources = sourceOverride;` after `resolveRoleFn()` call

## 5. Add Tests

- [x] 5.1 Create `packages/shared/tests/dialect-registry.test.ts` with tests for `resolveDialectName()` (15 tests)
- [x] 5.2 Add `--source` option registration test to `run-agent.test.ts`
- [x] 5.3 Add `normalizeSourceFlags()` unit tests to `run-agent.test.ts` (6 tests)
- [x] 5.4 Add source override integration tests via `runAgent()` with deps (2 tests)

## 6. Verification

- [x] 6.1 Run `npx tsc --noEmit` — compiles without errors
- [x] 6.2 Run `npx eslint` on changed files — no lint errors
- [x] 6.3 Run `npx vitest run packages/cli/tests/` — all 653 tests pass
- [x] 6.4 Run `npx vitest run packages/shared/tests/` — all 226 tests pass
