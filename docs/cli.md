---
title: CLI Reference
description: Complete command reference for the Mason CLI
---

# CLI Reference

Install the CLI globally:

```bash
npm install -g @clawmasons/mason
```

## Top-Level Commands

### `mason init`

Initialize a new lodge.

```bash
mason init [options]
```

| Option | Description |
|--------|-------------|
| `--lodge <name>` | Lodge name (overrides `LODGE` env var) |
| `--lodge-home <path>` | Lodge home directory (overrides `LODGE_HOME` env var) |
| `--home <path>` | Mason home directory (overrides `MASON_HOME` env var) |

### `mason run`

Run a role on the specified agent runtime, either interactively or as an ACP endpoint for editor integration.

```bash
mason run <agent-type> --role <name> [options]
```

| Argument | Description |
|----------|-------------|
| `<agent-type>` | Agent runtime to use (e.g., `claude` → `claude-code`, `pi` → `pi-coding-agent`, `mcp-agent`) |

| Option | Description |
|--------|-------------|
| `--role <name>` | **(required)** Role name to run |
| `--acp` | Start in ACP mode for editor integration (stdio ndjson) |
| `--proxy-port <number>` | Internal proxy port (default: `3000`) |
| `--chapter <name>` | Chapter name (use `initiate` for bootstrap flow, ACP mode) |

**Shorthand**: You can omit `run` — `mason <agent-type> --role <name>` is equivalent.

**Interactive mode** (default):

```bash
mason run claude --role writer
```

Starts the MCP proxy and agent containers via Docker Compose, then attaches interactively.

**ACP mode** (`--acp`):

```bash
mason run claude --role writer --acp
```

Starts an ACP-compliant endpoint for editor integration via stdio ndjson.

**ACP client configuration example** (e.g., for Zed settings):

```json
{
  "context_servers": {
    "mason": {
      "command": {
        "path": "mason",
        "args": ["run", "claude", "--role", "writer", "--acp"]
      }
    }
  }
}
```

In both modes, the MCP proxy runs in a Docker container and the credential service runs in-process on the host.

### `mason package`

Build and pack a local role from `.mason/roles/<name>/` into a distributable npm `.tgz` package.

```bash
mason package --role <name>
```

| Option | Description |
|--------|-------------|
| `--role <name>` | **(required)** Role name to package (must exist at `.mason/roles/<name>/ROLE.md`) |

Steps performed:
1. Loads `ROLE.md` from `.mason/roles/<name>/ROLE.md`
2. Validates all task and skill references can be resolved from `role.sources`
3. Assembles build directory at `.mason/roles/<name>/build/`
4. Generates `package.json` in the build directory (merges user-supplied `package.json` if present)
5. Runs `npm install`, then `npm run build` if a build script exists, then `npm pack`

Output: `.mason/roles/<name>/build/*.tgz`

---

## Chapter Subcommands

All workspace management commands are under the `chapter` subgroup.

### `mason chapter init`

Initialize a new chapter workspace.

```bash
mason chapter init --name <lodge>.<chapter> [options]
```

| Option | Description |
|--------|-------------|
| `--name <name>` | **(required)** Workspace name in `<lodge>.<chapter>` format |
| `--template <template>` | Use a project template (e.g., `note-taker`) |

### `mason chapter build`

Build chapter workspace: resolve roles, pack packages, and generate Docker artifacts.

```bash
mason chapter build [role] [options]
```

| Argument | Description |
|----------|-------------|
| `[role]` | Role package name (auto-detects if only one; builds all if omitted) |

| Option | Description |
|--------|-------------|
| `--output <path>` | Output path for lock file |
| `--json` | Print lock file to stdout as JSON |

### `mason chapter list`

List roles and their dependency trees.

```bash
mason chapter list [options]
```

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

### `mason chapter validate`

Validate a role's dependency graph and permissions.

```bash
mason chapter validate <role> [options]
```

| Argument | Description |
|----------|-------------|
| `<role>` | Role package name to validate |

| Option | Description |
|--------|-------------|
| `--json` | Output validation result as JSON |

### `mason chapter permissions`

Display the resolved permission matrix and tool filters for a role.

```bash
mason chapter permissions <role> [options]
```

| Argument | Description |
|----------|-------------|
| `<role>` | Role package name |

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

### `mason chapter add`

Add a chapter package dependency (wraps npm install with chapter validation).

```bash
mason chapter add <pkg> [npmArgs...]
```

| Argument | Description |
|----------|-------------|
| `<pkg>` | Package name to add |
| `[npmArgs...]` | Additional arguments forwarded to npm install |

### `mason chapter remove`

Remove a chapter package dependency (wraps npm uninstall with dependent checking).

```bash
mason chapter remove <pkg> [npmArgs...] [options]
```

| Argument | Description |
|----------|-------------|
| `<pkg>` | Package name to remove |
| `[npmArgs...]` | Additional arguments forwarded to npm uninstall |

| Option | Description |
|--------|-------------|
| `--force` | Remove even if other packages depend on it |

### `mason chapter init-role`

Initialize a host-wide runtime directory for a chapter role.

```bash
mason chapter init-role --role <name> [options]
```

| Option | Description |
|--------|-------------|
| `--role <name>` | **(required)** Role to initialize |
| `--target-dir <path>` | Override the default role directory location |

### `mason chapter pack`

Build and pack all workspace packages into `dist/`.

```bash
mason chapter pack
```

### `mason chapter proxy`

Start the chapter MCP proxy server for a role.

```bash
mason chapter proxy [options]
```

| Option | Description |
|--------|-------------|
| `--port <number>` | Port to listen on (default: from role config or `9090`) |
| `--startup-timeout <seconds>` | Upstream server startup timeout (default: `60`) |
| `--role <name>` | Role package name (auto-detected if only one) |
| `--transport <type>` | Transport type: `sse` or `streamable-http` (default: from role config or `sse`) |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MASON_HOME` | `~/.mason` | Root directory for mason data |
| `LODGE` | Auto-detected | Current lodge name |
| `LODGE_HOME` | `$MASON_HOME/$LODGE` | Current lodge directory |

---

## Project Configuration

### `.mason/config.json`

Register custom or third-party agent runtimes for a project. Built-in agents (`claude`, `pi`, `mcp`) are always available; this file lets you add others or configure defaults.

```json
{
  "agents": {
    "claude": {
      "package": "@clawmasons/claude-code",
      "role": "writer",
      "mode": "terminal",
      "home": "~/my-claude-config"
    },
    "my-agent": {
      "package": "@my-org/my-agent-package"
    }
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `package` | string | yes | npm package name implementing the Agent Package SDK |
| `role` | string | no | Default role name when `--role` is omitted |
| `mode` | `"terminal"` \| `"acp"` \| `"bash"` | no | Default startup mode (overridden by CLI flags) |
| `home` | string | no | Host path to bind-mount at `/home/mason/` in the agent container; `~` is expanded |
| `dev-container-customizations` | object | no | VSCode extensions and settings to embed in the agent image at build time |

**Notes:**
- Config agents can override built-in agent names
- `--role`, `--acp`, `--bash`, `--home` flags always take precedence over config defaults
- An invalid `mode` value logs a warning and falls back to `"terminal"`
- If `home` path does not exist, a warning is logged and the agent still starts
