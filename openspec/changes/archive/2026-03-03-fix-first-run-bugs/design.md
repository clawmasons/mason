## Design: Fix First-Run Bugs

### Two-Phase Run Strategy

The core issue is that `docker compose up -d` detaches all containers, but Claude Code needs an interactive terminal (stdin/tty). The solution:

1. **Phase 1:** `docker compose up -d mcp-proxy` — start the proxy in the background
2. **Phase 2:** `docker compose run --rm <runtime>` — run the runtime in the foreground with stdio attached

Auto-detection: Parse the compose file for service names, filter out `mcp-proxy`, and use the remaining service. If multiple exist, require `--runtime`.

### Token Baking

Claude Code reads `.claude/settings.json` as raw JSON with no environment variable interpolation. The `${PAM_PROXY_TOKEN}` placeholder in the Authorization header was never resolved. Solution: generate the token before materialization and pass it through so the actual hex value gets embedded in the JSON.

### OOBE Skip

Claude Code's OOBE wizard blocks the agent from starting. Writing `{"hasCompletedOnboarding": true}` to `/root/.claude/settings.json` during Docker build skips it. `DISABLE_AUTOUPDATER=1` prevents update prompts.

### Restart Policy

Interactive containers with `restart: unless-stopped` would restart endlessly after the user exits. Changed to `restart: "no"`.
