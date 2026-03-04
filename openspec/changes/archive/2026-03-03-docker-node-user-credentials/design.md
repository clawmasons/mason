## Architecture

No new modules. This change modifies three existing files to update container behavior.

### Dockerfile Changes

The generated Dockerfile switches from running everything as root to:

1. **Install phase** (as root): `npm install -g @anthropic-ai/claude-code`
2. **Setup phase** (as root): Create `/home/node/.claude` directory, write OOBE bypass to `/home/node/.claude.json`, create entrypoint script
3. **Ownership**: `chown -R node:node /home/node/.claude /home/node/.claude.json`
4. **User switch**: `USER node`
5. **Workspace**: `WORKDIR /home/node/workspace`, `COPY --chown=node:node workspace/ /home/node/workspace/`
6. **Entrypoint**: Script that creates `.credentials.json` from `CLAUDE_AUTH_TOKEN` env var, then execs `claude`

### Entrypoint Script

```bash
#!/bin/sh
if [ -n "$CLAUDE_AUTH_TOKEN" ]; then
  mkdir -p /home/node/.claude
  printf '%s' "$CLAUDE_AUTH_TOKEN" > /home/node/.claude/.credentials.json
fi
exec "$@"
```

The `CLAUDE_AUTH_TOKEN` env var contains the **full JSON content** of `.credentials.json`. The user copies this from their local `~/.claude/.credentials.json`. This avoids assumptions about the internal credential format.

### Compose Service Changes

- Volume: `./claude-code/workspace:/home/node/workspace`
- Working dir: `/home/node/workspace`
- Environment: `CLAUDE_AUTH_TOKEN=${CLAUDE_AUTH_TOKEN}` replaces `ANTHROPIC_API_KEY`

### Env Template Changes

- `RUNTIME_API_KEYS["claude-code"]` changes from `"ANTHROPIC_API_KEY"` to `"CLAUDE_AUTH_TOKEN"`

## Decisions

1. **Full JSON in env var**: Rather than parsing individual OAuth fields, `CLAUDE_AUTH_TOKEN` holds the complete `.credentials.json` content. This is future-proof against format changes.
2. **`printf` over `echo`**: `printf '%s'` handles JSON with special characters correctly.
3. **`/bin/sh` over `/bin/bash`**: `node:22-slim` may not have bash; sh is always available.
