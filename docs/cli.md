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

### `clawmasons agent`

Run a chapter agent interactively against the current project.

```bash
clawmasons agent <agent> <role>
```

| Argument | Description |
|----------|-------------|
| `<agent>` | Agent slug (e.g., `note-taker`) |
| `<role>` | Role name (e.g., `writer`) |

This starts the MCP proxy, credential service, and agent containers via Docker Compose, then attaches interactively.

### `clawmasons acp`

Start an ACP-compliant agent endpoint for editor integration.

```bash
clawmasons acp --role <name> [options]
```

| Option | Description |
|--------|-------------|
| `--role <name>` | **(required)** Role to use for the session |
| `--agent <name>` | Agent package name (auto-detected if only one) |
| `--proxy-port <number>` | Internal proxy port (default: `3000`) |
| `--chapter <name>` | Chapter name (use `initiate` for bootstrap flow) |
| `--init-agent <name>` | Agent name override for bootstrap |

**ACP client configuration example** (e.g., for Zed settings):

```json
{
  "context_servers": {
    "clawmasons": {
      "command": {
        "path": "clawmasons",
        "args": ["acp", "--role", "writer"]
      }
    }
  }
}
```

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

Build chapter workspace: resolve agents, pack packages, and generate Docker artifacts.

```bash
clawmasons chapter build [agent] [options]
```

| Argument | Description |
|----------|-------------|
| `[agent]` | Agent package name (auto-detects if only one; builds all if omitted) |

| Option | Description |
|--------|-------------|
| `--output <path>` | Output path for lock file |
| `--json` | Print lock file to stdout as JSON |

### `clawmasons chapter list`

List agents and their dependency trees.

```bash
clawmasons chapter list [options]
```

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

### `clawmasons chapter validate`

Validate an agent's dependency graph and permissions.

```bash
clawmasons chapter validate <agent> [options]
```

| Argument | Description |
|----------|-------------|
| `<agent>` | Agent package name to validate |

| Option | Description |
|--------|-------------|
| `--json` | Output validation result as JSON |

### `clawmasons chapter permissions`

Display the resolved permission matrix and tool filters for an agent.

```bash
clawmasons chapter permissions <agent> [options]
```

| Argument | Description |
|----------|-------------|
| `<agent>` | Agent package name |

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
| `--agent <name>` | Specific agent to include (default: all agents with the role) |
| `--target-dir <path>` | Override the default role directory location |

### `clawmasons chapter pack`

Build and pack all workspace packages into `dist/`.

```bash
clawmasons chapter pack
```

### `clawmasons chapter proxy`

Start the chapter MCP proxy server for an agent.

```bash
clawmasons chapter proxy [options]
```

| Option | Description |
|--------|-------------|
| `--port <number>` | Port to listen on (default: from agent config or `9090`) |
| `--startup-timeout <seconds>` | Upstream server startup timeout (default: `60`) |
| `--agent <name>` | Agent package name (auto-detected if only one) |
| `--transport <type>` | Transport type: `sse` or `streamable-http` (default: from agent config or `sse`) |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAWMASONS_HOME` | `~/.clawmasons` | Root directory for clawmasons data |
| `LODGE` | Auto-detected | Current lodge name |
| `LODGE_HOME` | `$CLAWMASONS_HOME/$LODGE` | Current lodge directory |
