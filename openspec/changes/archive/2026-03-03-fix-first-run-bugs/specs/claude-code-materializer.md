## MODIFIED Requirements

### Requirement: Restart policy changed to "no"

**Modified.** `generateComposeService()` SHALL return `restart: "no"` instead of `restart: "unless-stopped"`. Interactive containers should not auto-restart.

### Requirement: Dockerfile skips OOBE and disables auto-updater

**Modified.** `generateDockerfile()` SHALL additionally:
- Write `{"hasCompletedOnboarding": true}` to `/root/.claude/settings.json` to skip the setup wizard
- Set `ENV DISABLE_AUTOUPDATER=1`

### Requirement: materializeWorkspace accepts optional proxyToken

**Modified.** `materializeWorkspace()` now accepts an optional third parameter `proxyToken?: string`. When provided, the actual token value is baked into the Authorization header in settings.json instead of using the `${FORGE_PROXY_TOKEN}` placeholder.
