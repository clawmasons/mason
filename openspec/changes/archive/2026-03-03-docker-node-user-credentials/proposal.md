## Why

After running `pam install`, the generated Claude Code container runs as root, uses `ANTHROPIC_API_KEY` for auth, and mounts the workspace at `/workspace`. This doesn't match how Claude Code is typically used in the `node:22-slim` Docker image:

1. The container should run as the `node` user (UID 1000), not root
2. Claude config should live at `/home/node/.claude`, not `/root/.claude`
3. Auth should use `.credentials.json` (OAuth token from `/login`), not `ANTHROPIC_API_KEY`
4. Workspace should be at `/home/node/workspace`

These changes let users replicate their local Claude Code setup inside Docker by providing the OAuth token from `/login` in `.env`.

## What Changes

- **Dockerfile generation** (`src/materializer/claude-code.ts`):
  - Install claude-code as root, then switch to `USER node`
  - Place OOBE bypass at `/home/node/.claude.json`
  - Add entrypoint script that creates `/home/node/.claude/.credentials.json` from `CLAUDE_AUTH_TOKEN` env var
  - WORKDIR `/home/node/workspace`

- **Compose service** (`src/materializer/claude-code.ts`):
  - Mount workspace at `/home/node/workspace`
  - Replace `ANTHROPIC_API_KEY` with `CLAUDE_AUTH_TOKEN` env var
  - Set `working_dir` to `/home/node/workspace`

- **Env template** (`src/compose/env.ts`):
  - Map `claude-code` runtime to `CLAUDE_AUTH_TOKEN` instead of `ANTHROPIC_API_KEY`

## Capabilities

### Modified Capabilities
- `claude-code-materializer`: Dockerfile runs as `node` user, uses credentials-based auth via entrypoint, workspace at `/home/node/workspace`
- `docker-compose-generation`: Compose service updated for new paths and auth approach
- `env-generation`: `claude-code` runtime maps to `CLAUDE_AUTH_TOKEN` instead of `ANTHROPIC_API_KEY`

## Impact

- **Modified:** `src/materializer/claude-code.ts` — Dockerfile, compose service, and workspace materialization
- **Modified:** `src/compose/env.ts` — runtime API key mapping
- **Modified:** `tests/materializer/claude-code.test.ts` — updated assertions for new paths and auth
- **Modified:** `tests/compose/env.test.ts` — updated assertions for CLAUDE_AUTH_TOKEN
- **No new dependencies**
