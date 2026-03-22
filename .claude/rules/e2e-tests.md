# .claude/rules/e2e-tests.md
---
paths: packages/*/tests/e2e/**/*
---

# E2E Test Standards

In e2e tests we are testing command line inputs and outputs, not internals.

All e2e tests:

* SHOULD: Use a fixture directory for common setups.
  Place fixtures in `packages/<name>/tests/e2e/fixtures/` or use shared fixtures from `packages/agent-sdk/fixtures/`.

* MUST: JUST run the command line.

* MUST: Test inputs/outputs of the command line and artifacts generated.

**If you need to mock something out, then that should be a non-e2e test OR the command line is broken and may need to be fixed.**

## Non-E2E test locations
* If the test just requires mocks and can run without external calls, add it to `packages/<name>/tests/`
* If it requires mocks and external things like Docker, it should be an integration test at `packages/<name>/tests/integration/`

## Running E2E tests
* All e2e tests: `npm run test:e2e` (from repo root)
* Per-package: `npx vitest run --config packages/<name>/vitest.e2e.config.ts`

## Shared utilities
Import test helpers from `@clawmasons/agent-sdk/testing`:
```ts
import { copyFixtureWorkspace, masonExec } from "@clawmasons/agent-sdk/testing";
```

At the start of any work on e2e tests, acknowledge that you have read and agree to the "E2E Test Standards".

Ask the user to confirm your acknowledgement and understanding, especially if the user is asking you to do something that violates the E2E Test Standards.
