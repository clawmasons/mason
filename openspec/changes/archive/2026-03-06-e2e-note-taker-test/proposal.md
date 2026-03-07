## Why

Changes 6 and 7 established the E2E testing framework (package structure, setup/teardown scripts, vitest config) and the test fixtures (a pi-coding-agent member with OpenRouter using the role-writer dependency chain from chapter-core). However, there are no actual E2E tests yet -- the framework and fixtures exist but nothing exercises them.

Change 8 completes the E2E story by writing the test suite that validates the note-taker member materialized for pi-coding-agent with OpenRouter. This is the payoff for all the infrastructure work: concrete assertions that the pi materializer produces correct output when driven through the full `chapter install` pipeline against real fixture packages.

Without this test, regressions in the pi materializer, Docker Compose generation, or env var handling would go undetected until manual testing. The E2E test catches integration issues that unit tests miss -- for example, whether `chapter init` + `chapter install` work together end-to-end against a real workspace with npm dependencies.

## What Changes

- **New `e2e/tests/note-taker-pi.test.ts`** -- E2E test suite with:
  - `beforeAll`: Runs the setup script to create a temp chapter workspace from fixtures, runs `chapter init` + `chapter install @test/member-test-note-taker`
  - `afterAll`: Runs teardown to clean up the temp workspace
  - **Workspace materialization tests** (always run):
    - All expected pi workspace files exist (`AGENTS.md`, `.pi/settings.json`, `.pi/extensions/chapter-mcp/index.ts`, `skills/`)
    - `.pi/settings.json` contains correct OpenRouter model ID (`openrouter/anthropic/claude-sonnet-4`)
    - Extension code registers MCP server and take-notes command
    - `AGENTS.md` contains role-writer context
  - **Docker Compose generation tests** (always run):
    - `docker-compose.yml` includes `pi-coding-agent` service
    - Service environment includes `OPENROUTER_API_KEY`
    - Service depends on `mcp-proxy`
  - **Env configuration tests** (always run):
    - `.env` includes `OPENROUTER_API_KEY=`
    - `.env` includes `CHAPTER_PROXY_TOKEN=` with a generated token
  - **Infrastructure tests** (skip when Docker/API keys unavailable):
    - Proxy connectivity test (skip if no Docker)
    - Task execution test (skip if no OPENROUTER_API_KEY)

## Capabilities

### New Capabilities
- `e2e-test-note-taker-pi`: Full E2E test suite validating pi-coding-agent materialization for the note-taker use case

### Modified Capabilities
- None -- this change only adds a new test file

## Impact

- **New:** `e2e/tests/note-taker-pi.test.ts` -- E2E test suite
- **No code changes** to production source files
- **No changes** to existing test files
- **No new dependencies**
