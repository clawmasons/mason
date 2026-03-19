## Why

When stacking bind mounts, named volumes, and configs on overlapping container paths, child mounts can resolve before parent mounts, causing masking and overlay failures. Standard agents currently generate single-file mounts (`.mcp.json`, `AGENTS.md`, `.claude.json`) that compound this ordering problem. Reducing single-file mounts at the source eliminates a class of Docker mount race conditions without requiring mount ordering workarounds.

## What Changes

- **claude-code-agent**: Remove `.mcp.json` single-file mount. Instead, generate MCP server config into the Claude home directory config (e.g., `~/.claude/`) the same way supervisor roles already do — mounted as a directory, not a single file.
- **agent-sdk + all agents**: Remove `AGENTS.md` generation entirely. The SDK helper `generateAgentsMd()` and all agent materializers that call it SHALL no longer produce or mount `AGENTS.md`.
- **run command — OCI restart**: The existing `restart` option SHALL only trigger a restart when the Docker error output contains the string `"OCI runtime"`. Non-OCI errors SHALL not trigger a restart.
- **run command — restart pause**: When an OCI runtime restart is triggered, the command SHALL pause 2 seconds before restarting.
- **run command — single-file mount warning**: When a restart is triggered due to an OCI runtime error, the command SHALL display all single-file volume mounts (e.g., `.env`) to the user and recommend converting them to directory mounts to avoid the underlying race condition.

## Capabilities

### New Capabilities
- `oci-restart-policy`: Restart logic for `chapter run` that is gated on OCI runtime errors, includes a 2s cooldown, and surfaces single-file mount warnings to the user.

### Modified Capabilities
- `claude-code-materializer`: MCP config is now written into the Claude home directory (directory mount) instead of `.mcp.json` (single-file mount). `AGENTS.md` generation is removed.
- `agent-sdk`: Remove `generateAgentsMd()` export and the AGENTS.md generation requirement.
- `run-command`: Add OCI-gated restart behavior with pause and user warning.

## Impact

- `packages/claude-code-agent/` — materializer changes: remove `.mcp.json` generation, add home-dir MCP config, remove `AGENTS.md` generation
- `packages/agent-sdk/` — remove `generateAgentsMd()` helper
- `packages/cli/` — `run` command restart logic
- Any other agent packages that call `generateAgentsMd()` (e.g., `packages/supervisor-agent/`, other agent materializers)
- Docker compose volume definitions for claude-code-agent service (removes single-file mounts for `.mcp.json` and `AGENTS.md`)
