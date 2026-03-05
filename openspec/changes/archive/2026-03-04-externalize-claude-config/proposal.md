## Why

The current setup bakes `.claude.json` and `.claude/` directory creation into the Dockerfile, and injects credentials via an entrypoint script from the `CLAUDE_AUTH_TOKEN` env var. This approach has two problems:

1. **Credential management burden**: Users must extract their OAuth credentials JSON and paste it into `.env`. This is error-prone and requires understanding the credential format.
2. **Single-instance limitation**: Since `.claude/` is internal to the container, each container gets its own isolated config. Users can't share session state or run multiple instances against the same config.

Instead, we should:
- **Externalize** both `.claude/` and `.claude.json` as host-mounted volumes
- **Remove credential injection** entirely — users log in to Claude Code on first run via `claude /login`, which writes credentials to the mounted `.claude/` directory
- **Seed `.claude.json`** at install time alongside the workspace directory (not in the Dockerfile)
- **Create an empty `.claude/` directory** at install time for the volume mount

This makes first-run simpler (just `docker compose run claude-code` and login) and enables running multiple agent instances against the same externalized config.

## What Changes

- **Dockerfile generation** (`src/materializer/claude-code.ts`):
  - Remove `.claude.json` creation (heredoc)
  - Remove `.claude/` directory creation and chown
  - Remove entrypoint script for credential injection
  - Remove `ENTRYPOINT` directive (just use CMD directly)
  - Keep: base image, npm install, DISABLE_AUTOUPDATER, USER node, WORKDIR, COPY workspace

- **Compose service** (`src/materializer/claude-code.ts`):
  - Add volume mount `./claude-code/.claude:/home/node/.claude` (rw)
  - Add volume mount `./claude-code/.claude.json:/home/node/.claude.json` (rw)
  - Remove `CLAUDE_AUTH_TOKEN` from environment

- **Install command** (`src/cli/commands/install.ts`):
  - Generate `claude-code/.claude.json` file with OOBE bypass content
  - Create empty `claude-code/.claude/` directory (via `.gitkeep` or just mkdir)
  - Remove `CLAUDE_AUTH_TOKEN` from `.env` "next steps" messaging

- **Env template** (`src/compose/env.ts`):
  - Remove `claude-code` from `RUNTIME_API_KEYS` mapping (no more `CLAUDE_AUTH_TOKEN`)

## Capabilities

### Modified Capabilities
- `claude-code-materializer`: Dockerfile simplified (no config/credentials setup), compose service adds .claude volume mounts
- `docker-compose-generation`: No direct changes (renders whatever ComposeServiceDef provides)
- `env-generation`: `claude-code` runtime no longer maps to any auth token
- `forge-install-command`: Generates .claude.json and empty .claude/ directory as install artifacts

## Impact

- **Modified:** `src/materializer/claude-code.ts` — Simplified Dockerfile, updated compose service volumes/env
- **Modified:** `src/compose/env.ts` — Remove claude-code from RUNTIME_API_KEYS
- **Modified:** `tests/materializer/claude-code.test.ts` — Updated assertions
- **Modified:** `tests/compose/env.test.ts` — Updated assertions
- **No new dependencies**
