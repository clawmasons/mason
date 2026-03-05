## 1. Create integration test file

- [x] 1.1 Create `tests/integration/install-flow.test.ts` with vitest describe/it structure
- [x] 1.2 Implement `beforeAll`: run `npm run build`, `npm pack` at root, `npm pack` in forge-core, store tgz paths
- [x] 1.3 Implement `afterAll`: clean up temp directory (pass or fail)

## 2. Implement test steps

- [x] 2.1 Test: Install forge tgz, run `forge init --template note-taker`, verify scaffold and template files
- [x] 2.2 Test: Install both tgz files for full dependency resolution, verify node_modules structure
- [x] 2.3 Test: Run `forge validate` on the template's agent, verify valid output
- [x] 2.4 Test: Run `forge list --json` and verify agent tree structure with forge-core components
- [x] 2.5 Test: Run `forge install` and verify single-stage Dockerfile (no `AS builder`), docker-compose.yml, and pre-built artifacts

## 3. Verify

- [x] 3.1 Run the integration test and confirm it passes (5/5 tests pass)
- [x] 3.2 Run the full test suite (`npx vitest run`) and confirm no regressions (555/555 tests pass)
- [x] 3.3 Run typecheck (`npx tsc --noEmit`) and confirm no new type errors
- [x] 3.4 Run linter (`npx eslint tests/integration/install-flow.test.ts`) and confirm no lint errors
