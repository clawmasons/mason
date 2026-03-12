# Tasks: End-to-End Test Suite Update

**Change:** #12
**Design:** [design.md](./design.md)

## Tasks

- [x] 1. Add `chapterExecExpectError()` helper to `e2e/tests/helpers.ts`
- [x] 2. Create `.claude/roles/test-writer/ROLE.md` fixture
- [x] 3. Create `e2e/tests/role-workflow.test.ts` -- local role discovery, list, validate, build
- [x] 4. Create `e2e/tests/cross-agent-materialization.test.ts` -- Claude role to other agent output
- [x] 5. Create `e2e/tests/volume-masking.test.ts` -- container ignore volume generation
- [x] 6. Create `e2e/tests/error-paths.test.ts` -- missing role, malformed ROLE.md, missing package
- [x] 7. Update `e2e/tests/acp-client-spawn.test.ts` -- replace `agent` with `run`
- [x] 8. Run all e2e tests and fix failures
- [x] 9. Run unit tests to verify no regressions
- [x] 10. Verify no references to deprecated `agent` command in e2e test code
