## Why

The E2E testing framework (Change 6) provides the package structure, setup/teardown scripts, and vitest configuration for running E2E tests. However, the `e2e/fixtures/test-chapter/` directory is still empty -- there are no actual fixture packages to test against. Without fixtures, the setup script creates an empty workspace with no members to install, making the E2E infrastructure effectively inert.

Change 7 fills this gap by creating the fixture packages that represent a real-world chapter configuration: a test member using `pi-coding-agent` runtime with OpenRouter as the LLM provider. This fixture reuses the existing `@clawmasons/role-writer` dependency chain from `chapter-core` (role-writer -> task-take-notes -> app-filesystem + skill-markdown-conventions), just with pi as the runtime instead of Claude Code.

These fixtures are the prerequisite for Change 8 (the actual E2E test suite). They must be correct, schema-valid, and installable via `chapter install` for the E2E tests to exercise the full materialization pipeline.

## What Changes

- **New `e2e/fixtures/test-chapter/package.json`** -- workspace root package.json with npm workspaces config pointing to `members/*` and dependency on `@clawmasons/chapter-core`
- **New `e2e/fixtures/test-chapter/members/test-note-taker/package.json`** -- agent member package with:
  - `runtimes: ["pi-coding-agent"]`
  - `llm: { provider: "openrouter", model: "anthropic/claude-sonnet-4" }`
  - `roles: ["@clawmasons/role-writer"]`
  - Depends on `@clawmasons/chapter-core` for the role/task/skill/app chain

## Capabilities

### New Capabilities
- `e2e-test-fixture-chapter`: A complete test chapter workspace root with workspaces config
- `e2e-test-fixture-note-taker`: A pi-coding-agent member fixture with OpenRouter LLM config that exercises the full role-writer dependency chain

### Modified Capabilities
- `e2e-setup-script`: The setup script can now discover and install the test-note-taker member from fixtures

## Impact

- **New:** `e2e/fixtures/test-chapter/package.json` -- workspace root for test chapter
- **New:** `e2e/fixtures/test-chapter/members/test-note-taker/package.json` -- pi-coding-agent member fixture
- **No code changes** to production source files
- **No test changes** to existing test files
- **No new dependencies**
