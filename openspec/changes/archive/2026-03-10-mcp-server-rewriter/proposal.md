## Why

The ACP proxy's matcher (CHANGE 1) produces a `MatchResult` with matched and unmatched servers, but this result cannot yet be consumed by the Docker session orchestrator or surfaced to users. The proxy needs two additional transformations: (1) rewrite matched MCP server configs into a single `chapter` proxy entry for the agent container, and (2) generate structured warning messages for each dropped server so operators understand what was excluded and why.

## What Changes

- New `packages/cli/src/acp/rewriter.ts` — transforms a `MatchResult` plus proxy connection details into the rewritten `mcpServers` config (single `chapter` entry) and extracts credentials from matched servers' `env` fields for session injection into the credential-service.
- New `packages/cli/src/acp/warnings.ts` — generates formatted warning strings for each unmatched/dropped MCP server, following the PRD-specified format.
- New `packages/cli/tests/acp/rewriter.test.ts` — unit tests for rewriter logic.
- New `packages/cli/tests/acp/warnings.test.ts` — unit tests for warning generation.

## Capabilities

### New Capabilities
- `mcp-server-rewriter`: Rewrites matched MCP server configs into a single chapter proxy entry with auth header, and extracts credential keys from matched servers' env fields.
- `mcp-server-warnings`: Generates structured warning messages for dropped MCP servers following the PRD format.

### Modified Capabilities
_(none)_

## Impact

- **New file:** `packages/cli/src/acp/rewriter.ts`
- **New file:** `packages/cli/src/acp/warnings.ts`
- **New test:** `packages/cli/tests/acp/rewriter.test.ts`
- **New test:** `packages/cli/tests/acp/warnings.test.ts`
- **Dependencies:** Types from `packages/cli/src/acp/matcher.ts` (`MatchResult`, `MatchedServer`, `UnmatchedServer`)
- **No breaking changes** — these are new modules with no modifications to existing code
