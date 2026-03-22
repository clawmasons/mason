## 1. Update Error Message in docker-utils.ts

- [x] 1.1 Update `checkDockerCompose()` error message to include installation links per PRD Section 5.3

## 2. Hoist Docker Check into runAgent()

- [x] 2.1 Add `checkDockerCompose()` call at the top of `runAgent()`, after `initRegistry()`, before mode dispatch
- [x] 2.2 Use `deps?.checkDockerComposeFn ?? checkDockerCompose` for testability
- [x] 2.3 Catch errors, print to stderr, and call `process.exit(1)`

## 3. Remove Duplicate Checks from Mode Functions

- [x] 3.1 Remove `checkDocker` resolution and call from `runAgentInteractiveMode()`
- [x] 3.2 Remove `checkDocker` resolution and call from `runAgentDevContainerMode()`
- [x] 3.3 Remove `checkDocker` resolution and call from `runProxyOnly()`
- [x] 3.4 Confirm `runAgentAcpMode()` has no Docker check (it doesn't — now covered by the hoisted check in `runAgent()`)

## 4. Update Tests

- [x] 4.1 Verify existing "exits 1 when docker compose is not available" test still passes
- [x] 4.2 Add test: "docker check runs before role resolution" — verify resolveRoleFn is never called when docker check fails
- [x] 4.3 Add test: "ACP mode fails fast when docker is unavailable"
- [x] 4.4 Verify all existing tests that set `checkDockerComposeFn: () => {}` still pass (631 tests pass)

## 5. Verification

- [x] 5.1 Run `npx tsc --noEmit` — compiles without errors
- [x] 5.2 Run `npx eslint` — no lint errors
- [x] 5.3 Run `npx vitest run packages/cli/tests/` — all 631 tests pass
