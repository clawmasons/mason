## Why

The pam pipeline can resolve agent dependency graphs, validate them, and generate mcp-proxy configs with toolFilters — but it cannot yet produce runtime-specific workspaces. The Claude Code materializer is the first runtime materializer, translating the abstract resolved agent into a directory that Claude Code natively understands: MCP settings, slash commands, role documentation, and skill files. Without this, `pam install` cannot produce a deployable workspace.

## What Changes

- Define the `RuntimeMaterializer` interface that all materializers implement
- Implement the Claude Code materializer that generates:
  - `.claude/settings.json` — single pam-proxy MCP server entry with auth
  - `.claude/commands/*.md` — one slash command per task, scoped to the correct role's tools
  - `AGENTS.md` — agent identity with all roles and per-role tool declarations
  - `skills/{skill-name}/` — materialized skill artifact directories
  - `Dockerfile` for the Claude Code runtime container
- Expose a `materializeClaudeCode()` function from the generator module

## Capabilities

### New Capabilities
- `materializer-interface`: Defines the RuntimeMaterializer interface and shared types (MaterializationResult, ComposeServiceDef) that all runtime materializers implement
- `claude-code-materializer`: Generates a complete Claude Code workspace from a resolved agent — settings.json, slash commands, AGENTS.md, skills directory, and Dockerfile

### Modified Capabilities
<!-- No existing spec-level behavior changes -->

## Impact

- **New module:** `src/materializer/` with types, Claude Code implementation, and exports
- **New tests:** `tests/materializer/` with unit tests for all generated artifacts
- **Re-exports:** `src/index.ts` updated to export materializer module
- **Dependencies:** No new npm dependencies — uses only fs operations and string generation
