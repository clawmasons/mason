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

### `mason configure`

Configure a project for mason

```bash
mason configure [options]
```

| Option | Description |
|--------|-------------|
| `--agent <name>` | What agent you want to run configure as |

### `mason run`

Run a role on the specified agent runtime, either interactively, as an ACP endpoint, or in print mode.

```bash
mason run <agent-type> --role <name> [options]
mason run <agent-type> --role <name> [prompt]
mason run <agent-type> --role <name> -p <prompt>
```

| Argument | Description |
|----------|-------------|
| `<agent-type>` | Agent runtime to use (e.g., `claude` → `claude-code-agent`, `pi` → `pi-coding-agent`, `codex` → `codex-agent`) |
| `[prompt]` | Optional initial prompt to send to the agent on startup (interactive mode) |

| Option | Description |
|--------|-------------|
| `--role <name>` | **(required)** Role name to run |
| `-p, --print <prompt>` | Run in print mode: execute the prompt non-interactively and output only the final response |
| `--acp` | Start in ACP mode for editor integration (stdio ndjson) |
| `--dev-container` | Start in dev container mode for editor integration (stdio ndjson) |

**Shorthand**: You can omit `run` — `mason <agent-type> --role <name>` is equivalent.

**Interactive mode** (default):

```bash
mason run claude --role writer
```

Starts the MCP proxy and agent containers via Docker Compose, then attaches interactively.

You can also pass an initial prompt as a positional argument to start the agent with a specific instruction while remaining in interactive mode:

```bash
mason run claude --role writer "review the latest changes"
```

**Print mode** (`-p` / `--print`):

```bash
mason run claude --role writer -p "summarize this project"
mason run pi --role writer --print "explain the architecture"
```

Runs the agent non-interactively with the given prompt. All agent activity is captured to `.mason/logs/session.log` via JSON streaming, while the terminal receives only the final result text. The process exits with the agent's exit code, making it suitable for scripting and CI pipelines.

Print mode is mutually exclusive with `--acp`, `--bash`, `--dev-container`, and `--proxy-only`.

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

In both modes, the MCP proxy runs in a Docker container and the [host proxy](proxy.md) runs in-process on the host for credential resolution, approvals, and audit logging.

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

## Workspace Subcommands

Commands for managing workspaces and packages.

### `mason init`

Initialize a new workspace.

```bash
mason init --name <lodge>.<workspace> [options]
```

| Option | Description |
|--------|-------------|
| `--name <name>` | **(required)** Workspace name in `<lodge>.<workspace>` format |
| `--template <template>` | Use a project template (e.g., `note-taker`) |

### `mason build`

Build workspace: resolve roles, pack packages, and generate Docker artifacts.

```bash
mason build [role] [options]
```

| Argument | Description |
|----------|-------------|
| `[role]` | Role package name (auto-detects if only one; builds all if omitted) |

| Option | Description |
|--------|-------------|
| `--output <path>` | Output path for lock file |
| `--json` | Print lock file to stdout as JSON |

### `mason list`

List roles and their dependency trees.

```bash
mason list [options]
```

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

### `mason validate`

Validate a role's dependency graph and permissions.

```bash
mason validate <role> [options]
```

| Argument | Description |
|----------|-------------|
| `<role>` | Role package name to validate |

| Option | Description |
|--------|-------------|
| `--json` | Output validation result as JSON |

### `mason permissions`

Display the resolved permission matrix and tool filters for a role.

```bash
mason permissions <role> [options]
```

| Argument | Description |
|----------|-------------|
| `<role>` | Role package name |

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

### `mason add`

Add a package dependency (wraps npm install with validation).

```bash
mason add <pkg> [npmArgs...]
```

| Argument | Description |
|----------|-------------|
| `<pkg>` | Package name to add |
| `[npmArgs...]` | Additional arguments forwarded to npm install |

### `mason remove`

Remove a package dependency (wraps npm uninstall with dependent checking).

```bash
mason remove <pkg> [npmArgs...] [options]
```

| Argument | Description |
|----------|-------------|
| `<pkg>` | Package name to remove |
| `[npmArgs...]` | Additional arguments forwarded to npm uninstall |

| Option | Description |
|--------|-------------|
| `--force` | Remove even if other packages depend on it |

### `mason init-role`

Initialize a host-wide runtime directory for a role.

```bash
mason init-role --role <name> [options]
```

| Option | Description |
|--------|-------------|
| `--role <name>` | **(required)** Role to initialize |
| `--target-dir <path>` | Override the default role directory location |

### `mason pack`

Build and pack all workspace packages into `dist/`.

```bash
mason pack
```

### `mason proxy`

Start the MCP proxy server for a role.

```bash
mason proxy [options]
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
      "package": "@clawmasons/claude-code-agent",
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
| `mode` | `"terminal"` \| `"acp"` \| `"bash"` \| `"print"` | no | Default startup mode (overridden by CLI flags) |
| `home` | string | no | Host path to bind-mount at `/home/mason/` in the agent container; `~` is expanded |
| `dev-container-customizations` | object | no | VSCode extensions and settings to embed in the agent image at build time |

**Notes:**
- Config agents can override built-in agent names
- `--role`, `--acp`, `--bash`, `--home` flags always take precedence over config defaults
- An invalid `mode` value logs a warning and falls back to `"terminal"`
- If `home` path does not exist, a warning is logged and the agent still starts
