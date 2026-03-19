## Context

The `packages/tests` package contains 10 test files, most of which are broken or untested. They rely on a `test-chapter` fixture that has drifted from the current codebase. The only test worth keeping is `mcp-proxy-agent.test.ts`, which exercises the real CLI entrypoint and verifies behavior through stdout and REPL interaction — the correct model for e2e tests.

The `helpers.ts` file is shared utilities; it contains functions used by the deleted tests but also the three needed by the surviving test: `copyFixtureWorkspace`, `MASON_BIN`, and `isDockerAvailable`.

## Goals / Non-Goals

**Goals:**
- Delete all test files except `mcp-proxy-agent.test.ts` and `helpers.ts`
- Delete `fixtures/test-chapter/` and `scripts/` directories
- Run `mcp-proxy-agent.test.ts`, evaluate all errors, and fix them until passing
- Keep the test philosophy: spawn CLI, interact via stdio, verify via stdout and `docker exec`

**Non-Goals:**
- Rewriting or restructuring `mcp-proxy-agent.test.ts` beyond what's needed to make it pass
- Adding new test cases
- Cleaning up helpers.ts beyond removing dead exports (optional)

## Decisions

**Delete tests wholesale, don't archive**
All deleted tests depend on `test-chapter` which is stale. No value in preserving them. Rationale: keeping broken tests creates false confidence and maintenance burden.

**Keep helpers.ts intact**
`mcp-proxy-agent.test.ts` imports `copyFixtureWorkspace`, `MASON_BIN`, and `isDockerAvailable`. These are small, focused utilities. Inlining them into the test file would be unnecessary churn.

**Fix approach: run → read errors → fix iteratively**
The test spawns real Docker infrastructure. Failures may be in the fixture (`fixtures/claude-test-project/`), the CLI behavior, or timing. The fix strategy is: run the test, read the error output, fix the root cause, repeat.

**Verify with docker exec**
The test already writes a file via the proxy and reads it back via REPL. If needed, `docker exec <container> cat <file>` can be used for lower-level verification that bypasses the REPL.

## Risks / Trade-offs

- [Docker not available in CI] → Test skips via `isDockerAvailable()` guard — acceptable
- [Fixture claude-test-project is stale] → Will surface during the fix iteration; fix by updating the fixture
- [Test timeout] → 5-minute timeout is generous; real failures will show clear error output

## Open Questions

- Does `helpers.ts` have dead exports after the other tests are deleted? (Minor cleanup opportunity, not blocking)
