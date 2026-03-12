---
title: CLI Reference
description: Complete command reference for the clawmasons CLI
---

# CLI Reference

Install the CLI globally:

```bash
npm install -g @clawmasons/chapter
```

## Top-Level Commands

### `clawmasons init`

Initialize a new lodge.

```bash
clawmasons init [options]
```

| Option | Description |
|--------|-------------|
| `--lodge <name>` | Lodge name (overrides `LODGE` env var) |
| `--lodge-home <path>` | Lodge home directory (overrides `LODGE_HOME` env var) |
| `--home <path>` | Clawmasons home directory (overrides `CLAWMASONS_HOME` env var) |

### `clawmasons run`

Run a role on the specified agent runtime, either interactively or as an ACP endpoint for editor integration.

```bash
clawmasons run <agent-type> --role <name> [options]
```

| Argument | Description |
|----------|-------------|
| `<agent-type>` | Agent runtime to use (e.g., `claude`, `codex`, `aider`, `mcp-agent`) |

| Option | Description |
|--------|-------------|
| `--role <name>` | **(required)** Role name to run |
| `--acp` | Start in ACP mode for editor integration (stdio ndjson) |
| `--proxy-port <number>` | Internal proxy port (default: `3000`) |
| `--chapter <name>` | Chapter name (use `initiate` for bootstrap flow, ACP mode) |

**Shorthand**: You can omit `run` — `clawmasons <agent-type> --role <name>` is equivalent.

**Interactive mode** (default):

```bash
clawmasons run claude --role writer
```

Starts the MCP proxy and agent containers via Docker Compose, then attaches interactively.

**ACP mode** (`--acp`):

```bash
clawmasons run claude --role writer --acp
```

Starts an ACP-compliant endpoint for editor integration via stdio ndjson.

**ACP client configuration example** (e.g., for Zed settings):

```json
{
  "context_servers": {
    "clawmasons": {
      "command": {
        "path": "clawmasons",
        "args": ["run", "claude", "--role", "writer", "--acp"]
      }
    }
  }
}
```

In both modes, the MCP proxy runs in a Docker container and the credential service runs in-process on the host.

---

## Chapter Subcommands

All workspace management commands are under the `chapter` subgroup.

### `clawmasons chapter init`

Initialize a new chapter workspace.

```bash
clawmasons chapter init --name <lodge>.<chapter> [options]
```

| Option | Description |
|--------|-------------|
| `--name <name>` | **(required)** Workspace name in `<lodge>.<chapter>` format |
| `--template <template>` | Use a project template (e.g., `note-taker`) |

### `clawmasons chapter build`

Build chapter workspace: resolve roles, pack packages, and generate Docker artifacts.

```bash
clawmasons chapter build [role] [options]
```

| Argument | Description |
|----------|-------------|
| `[role]` | Role package name (auto-detects if only one; builds all if omitted) |

| Option | Description |
|--------|-------------|
| `--output <path>` | Output path for lock file |
| `--json` | Print lock file to stdout as JSON |

### `clawmasons chapter list`

List roles and their dependency trees.

```bash
clawmasons chapter list [options]
```

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

### `clawmasons chapter validate`

Validate a role's dependency graph and permissions.

```bash
clawmasons chapter validate <role> [options]
```

| Argument | Description |
|----------|-------------|
| `<role>` | Role package name to validate |

| Option | Description |
|--------|-------------|
| `--json` | Output validation result as JSON |

### `clawmasons chapter permissions`

Display the resolved permission matrix and tool filters for a role.

```bash
clawmasons chapter permissions <role> [options]
```

| Argument | Description |
|----------|-------------|
| `<role>` | Role package name |

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

### `clawmasons chapter add`

Add a chapter package dependency (wraps npm install with chapter validation).

```bash
clawmasons chapter add <pkg> [npmArgs...]
```

| Argument | Description |
|----------|-------------|
| `<pkg>` | Package name to add |
| `[npmArgs...]` | Additional arguments forwarded to npm install |

### `clawmasons chapter remove`

Remove a chapter package dependency (wraps npm uninstall with dependent checking).

```bash
clawmasons chapter remove <pkg> [npmArgs...] [options]
```

| Argument | Description |
|----------|-------------|
| `<pkg>` | Package name to remove |
| `[npmArgs...]` | Additional arguments forwarded to npm uninstall |

| Option | Description |
|--------|-------------|
| `--force` | Remove even if other packages depend on it |

### `clawmasons chapter init-role`

Initialize a host-wide runtime directory for a chapter role.

```bash
clawmasons chapter init-role --role <name> [options]
```

| Option | Description |
|--------|-------------|
| `--role <name>` | **(required)** Role to initialize |
| `--target-dir <path>` | Override the default role directory location |

### `clawmasons chapter pack`

Build and pack all workspace packages into `dist/`.

```bash
clawmasons chapter pack
```

### `clawmasons chapter proxy`

Start the chapter MCP proxy server for a role.

```bash
clawmasons chapter proxy [options]
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
| `CLAWMASONS_HOME` | `~/.clawmasons` | Root directory for clawmasons data |
| `LODGE` | Auto-detected | Current lodge name |
| `LODGE_HOME` | `$CLAWMASONS_HOME/$LODGE` | Current lodge directory |
