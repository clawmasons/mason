## Why

The `piCodingAgentMaterializer` is fully implemented (Changes 3-4) with workspace generation, Dockerfile, and Docker Compose service support. The `PROVIDER_ENV_VARS` mapping is already consumed by `src/compose/env.ts` for `.env` template generation. However, the install pipeline cannot actually invoke the pi materializer because it is not registered in the `materializerRegistry` Map in `src/cli/commands/install.ts`. Running `chapter install @member` for a member with `runtimes: ["pi-coding-agent"]` currently logs a warning and skips materialization entirely.

This change closes the gap by registering the materializer and adding integration tests that prove the full install pipeline works end-to-end for pi-coding-agent members.

## What Changes

- **Install command** (`src/cli/commands/install.ts`):
  - Import `piCodingAgentMaterializer` from the materializer package
  - Add `["pi-coding-agent", piCodingAgentMaterializer]` to the `materializerRegistry` Map

- **Tests** (`tests/cli/install.test.ts`):
  - Add a `pi-coding-agent member install` describe block with tests:
    - Pi member installs successfully and creates pi workspace files
    - Pi workspace contains `.pi/settings.json`, `AGENTS.md`, extension files
    - Docker Compose includes pi-coding-agent service with LLM provider env var
    - `.env` includes LLM provider API key
    - Pi member does not generate `.claude.json` or `.claude/` directory
    - Multi-runtime member (claude-code + pi-coding-agent) generates both workspaces

## Capabilities

### New Capabilities
- `pi-materializer-registry`: The pi-coding-agent materializer is discoverable and invokable by the install pipeline

### Modified Capabilities
- `install-pipeline`: Now supports pi-coding-agent runtime in addition to claude-code

## Impact

- **Modified:** `src/cli/commands/install.ts` -- Add pi materializer to registry (1 import, 1 Map entry)
- **Modified:** `tests/cli/install.test.ts` -- Add pi-coding-agent install tests
- **No new dependencies**
