## 1. Add warnings support to validator types

- [x] 1.1 Add `"llm-config"` to `ValidationErrorCategory` in `src/validator/types.ts`
- [x] 1.2 Add `member?: string` and `runtime?: string` to `ValidationError.context`
- [x] 1.3 Define `ValidationWarningCategory` type (`"llm-config"`)
- [x] 1.4 Define `ValidationWarning` interface (category, message, context)
- [x] 1.5 Add `warnings: ValidationWarning[]` to `ValidationResult`

## 2. Implement checkLlmConfig function

- [x] 2.1 Add `checkLlmConfig()` function to `src/validator/validate.ts`
- [x] 2.2 Error when `runtimes` includes `pi-coding-agent` and `llm` is absent
- [x] 2.3 Warning when `runtimes` includes `claude-code` and `llm` is present
- [x] 2.4 Skip check for human members
- [x] 2.5 Call `checkLlmConfig()` from `validateMember()`

## 3. Update validateMember to return warnings

- [x] 3.1 Initialize `warnings` array in `validateMember()`
- [x] 3.2 Return `warnings` in `ValidationResult`
- [x] 3.3 `valid` is still based only on `errors.length === 0`

## 4. Export new types

- [x] 4.1 Export `ValidationWarning` and `ValidationWarningCategory` from `src/validator/index.ts`
- [x] 4.2 Re-export from `src/index.ts`

## 5. Update CLI callers to display warnings

- [x] 5.1 Update `src/cli/commands/validate.ts` to display warnings
- [x] 5.2 Update `src/cli/commands/build.ts` to display warnings
- [x] 5.3 Update `src/cli/commands/install.ts` to display warnings

## 6. Add tests

- [x] 6.1 Test: pi-coding-agent without llm produces error
- [x] 6.2 Test: pi-coding-agent with llm produces no error
- [x] 6.3 Test: claude-code with llm produces warning (valid stays true)
- [x] 6.4 Test: claude-code without llm produces no warning
- [x] 6.5 Test: both runtimes without llm -- pi error, no claude-code warning
- [x] 6.6 Test: both runtimes with llm -- no pi error, claude-code warning
- [x] 6.7 Test: human member -- no llm-config checks
- [x] 6.8 Test: unknown runtime without llm -- no error
- [x] 6.9 Test: existing tests updated to assert `warnings` property exists

## 7. Verify

- [x] 7.1 `npx tsc --noEmit` passes
- [x] 7.2 `npx eslint src/ tests/` passes
- [x] 7.3 `npx vitest run` passes -- 651 tests, 40 test files, 0 failures
