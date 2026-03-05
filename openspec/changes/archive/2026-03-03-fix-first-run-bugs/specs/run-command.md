## MODIFIED Requirements

### Requirement: forge run uses two-phase Docker Compose strategy

**Replaces:** "forge run starts the Docker Compose stack" (single `up -d`)

The run command SHALL use a two-phase approach:
- Phase 1: `docker compose up -d mcp-proxy` (proxy detached)
- Phase 2: `docker compose run --rm <runtime>` (runtime interactive)

### Requirement: forge run auto-detects single runtime

**New.** When `--runtime` is not specified, the run command SHALL parse the compose file to detect runtime services (all services except `mcp-proxy`). If exactly one runtime exists, it SHALL be used automatically. If multiple exist, the command SHALL error and require `--runtime`.

### Requirement: forge run supports --runtime flag for selective startup

**Modified.** When `--runtime` is specified, the run command SHALL use the specified runtime in the two-phase startup (instead of the old `up -d mcp-proxy <runtime>`).
