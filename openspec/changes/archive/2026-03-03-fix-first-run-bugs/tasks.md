## Tasks

- [x] Fix restart policy: `unless-stopped` → `"no"` in `generateComposeService()`
- [x] Add OOBE skip to Dockerfile: `hasCompletedOnboarding` + `DISABLE_AUTOUPDATER=1`
- [x] Add optional `proxyToken` param to `materializeWorkspace()` interface
- [x] Bake actual token into `generateSettingsJson()` when provided
- [x] Always include `PAM_PROXY_TOKEN=${PAM_PROXY_TOKEN}` in mcp-proxy environment
- [x] Implement two-phase run: `up -d mcp-proxy` then `run --rm <runtime>`
- [x] Auto-detect single runtime; require `--runtime` for multiple
- [x] Move token generation before materialization in install command
- [x] Pass token to `materializeWorkspace()` in install command
- [x] Update install "Next steps" to show `pam run` as primary
- [x] Update tests for all changes
- [x] Update spec files for all modified capabilities
