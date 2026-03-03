## 1. Validation Types

- [x] 1.1 Create `src/validator/types.ts` with `ValidationResult`, `ValidationError`, and `ValidationErrorCategory` types
- [x] 1.2 Create `src/validator/index.ts` re-exporting types and functions

## 2. Validation Engine

- [x] 2.1 Create `src/validator/validate.ts` with `validateAgent(agent: ResolvedAgent): ValidationResult`
- [x] 2.2 Implement requirement coverage check: for each role's tasks, verify required apps have permissions entries in the parent role
- [x] 2.3 Implement tool existence check: for each role's permissions allow-list, verify tools exist in the resolved app's tools array
- [x] 2.4 Implement skill availability check: for each role's tasks, verify required skills are resolvable from task or role level
- [x] 2.5 Implement app launch config check: verify stdio apps have command+args, sse/streamable-http apps have url

## 3. CLI Command

- [x] 3.1 Create `src/cli/commands/validate.ts` with `registerValidateCommand(program)` following the init command pattern
- [x] 3.2 Implement discover → resolve → validate pipeline in the command action
- [x] 3.3 Implement human-readable output: errors grouped by category with context
- [x] 3.4 Implement `--json` flag for machine-readable output
- [x] 3.5 Register validate command in `src/cli/commands/index.ts`

## 4. Public API

- [x] 4.1 Update `src/index.ts` to export validator types and `validateAgent` function

## 5. Tests

- [x] 5.1 Create `tests/validator/validate.test.ts` with unit tests for each validation check
- [x] 5.2 Test requirement coverage: valid agent passes, task with uncovered app fails
- [x] 5.3 Test tool existence: valid tools pass, nonexistent allowed tool fails
- [x] 5.4 Test skill availability: skills resolved from task and role both pass, missing skill fails
- [x] 5.5 Test app launch config: valid stdio/sse pass, missing command/url fails
- [x] 5.6 Test collect-all-errors: multiple errors across categories all reported
- [x] 5.7 Test valid PRD repo-ops agent example passes all validation checks
- [x] 5.8 Create `tests/cli/validate.test.ts` testing CLI command registration, --json flag, and exit codes

## 6. Verification

- [x] 6.1 Run `npm test` and confirm all 125 tests pass (97 existing + 28 new)
- [x] 6.2 Run `npm run build` and confirm TypeScript compiles without errors
- [x] 6.3 Run `npm run lint` and confirm no lint errors
