## 1. Update Validator Types

- [x] 1.1 Add `"credential-coverage"` to `ValidationWarningCategory` type in `packages/cli/src/validator/types.ts`
- [x] 1.2 Add `credential?: string` to the `ValidationWarning.context` type

## 2. Implement Credential Coverage Check

- [x] 2.1 Add `checkCredentialCoverage()` function to `packages/cli/src/validator/validate.ts`
- [x] 2.2 Call `checkCredentialCoverage()` from `validateAgent()`

## 3. Unit Tests

- [x] 3.1 Add test: agent declaring all app credentials produces no warnings
- [x] 3.2 Add test: agent missing an app credential produces a warning naming agent, key, and app
- [x] 3.3 Add test: agent and apps both have no credentials produces no warnings
- [x] 3.4 Add test: multiple apps with overlapping credentials -- one warning per app-credential pair
- [x] 3.5 Add test: agent has extra credentials beyond what apps need -- no warnings

## 4. CLI Integration Test

- [x] 4.1 Add test: credential coverage warning appears in CLI output for misconfigured agent

## 5. Verification

- [x] 5.1 `npx tsc --noEmit` compiles
- [x] 5.2 `npx eslint packages/cli/src/ packages/cli/tests/` passes
- [x] 5.3 `npx vitest run` passes
