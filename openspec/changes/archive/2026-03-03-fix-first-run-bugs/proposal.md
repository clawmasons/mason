## Why

During the first manual run of a FORGE agent (note-taker example), several issues were discovered that prevent agents from running correctly:
1. `docker compose up -d` doesn't work for interactive claude-code (no stdin)
2. Restart policy `unless-stopped` is wrong for interactive containers
3. Install instructions don't mention `forge run`
4. Claude Code runs OOBE setup wizard in the container
5. MCP proxy returns 404 on all endpoints (missing FORGE_PROXY_TOKEN env var + token not baked into settings.json)

## What Changes

- Replace single `docker compose up -d` with two-phase strategy: proxy detached, runtime interactive
- Auto-detect single runtime from compose file; require `--runtime` when multiple exist
- Change restart policy from `unless-stopped` to `"no"` for interactive containers
- Add OOBE skip (`hasCompletedOnboarding: true`) and `DISABLE_AUTOUPDATER=1` to Dockerfile
- Always include `FORGE_PROXY_TOKEN` in mcp-proxy environment
- Bake actual proxy token into settings.json (Claude Code doesn't interpolate env vars in JSON)
- Move token generation before materialization so it can be passed to materializers
- Update install "Next steps" to show `forge run` as primary command

## Capabilities

### Modified Capabilities
- `run-command`: Two-phase Docker Compose strategy with auto-detect runtime
- `claude-code-materializer`: Restart policy, Dockerfile OOBE skip, token baking in settings.json
- `materializer-interface`: Add optional `proxyToken` param to `materializeWorkspace()`
- `docker-compose-generation`: FORGE_PROXY_TOKEN always in mcp-proxy environment
- `forge-install-command`: Token generated before materialization, passed to materializers, updated instructions

## Impact

- **Code**: 5 source files modified, 4 test files updated
- **Dependencies**: None
- **Systems**: Docker container startup behavior changes (interactive mode)
- **Existing behavior**: `forge run` now uses two-phase approach instead of single `up -d`
