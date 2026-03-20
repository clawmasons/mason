---
title: Initialization
description: How mason sets up the .mason directory and prepares your project for agent execution
---

# Initialization

When you first run `mason run` or `mason configure` in a project, Mason creates a `.mason` directory that holds all the configuration, build artifacts, and session data needed to run agents securely. Each step is idempotent — running it again safely skips what already exists.

## The `.mason` Directory

```
your-project/
└── .mason/
    ├── config.json          # Agent registry and alias configuration
    ├── .gitignore           # Ignores docker/ and sessions/
    ├── roles/               # Local role definitions
    │   └── <role-name>/
    │       └── ROLE.md
    ├── docker/              # Docker build artifacts (generated)
    │   └── <role-name>/
    │       ├── mcp-proxy/
    │       ├── <agent-type>/
    │       ├── node_modules/
    │       └── package.json
    └── sessions/            # Session state (generated per run)
        └── <session-id>/
            ├── docker/
            │   ├── docker-compose.yml
            │   └── .env
            └── logs/
```

### `config.json`

The agent registry that maps agent names to their npm packages, along with any aliases you've configured:

```json
{
  "agents": {
    "claude": { "package": "@clawmasons/claude-code-agent" },
    "pi": { "package": "@clawmasons/pi-coding-agent" },
    "mcp": { "package": "@clawmasons/mcp-agent" }
  },
  "aliases": {}
}
```

Mason creates this file automatically on first run with the default built-in agents. You can add custom agents or configure aliases here. See [CLI Reference](cli.md#project-configuration) for the full schema.

### `roles/`

Local role definitions live here. Each role is a subdirectory containing a `ROLE.md` file:

```
.mason/roles/
├── developer/
│   └── ROLE.md
├── lead/
│   └── ROLE.md
└── devops/
    └── ROLE.md
```

These roles are created by `mason configure` or by hand. See [Role](role.md) for the ROLE.md format.

## Role Discovery

When you run `mason run <agent> --role <name>`, Mason searches for the role in two places:

1. **Local roles** (highest priority) — `.mason/roles/<name>/ROLE.md`
2. **Installed npm packages** — Any package in `node_modules/` with `mason.type: "role"` in its `package.json`

Local roles take precedence over packaged roles with the same name. This lets you override a published role with a local customization.

## Docker Build Artifacts

The `.mason/docker/` directory contains generated Dockerfiles and dependencies for each role. Mason creates these automatically the first time you run a role.

```
.mason/docker/<role-name>/
├── mcp-proxy/          # MCP proxy Dockerfile and workspace
│   ├── Dockerfile
│   └── workspace/
├── <agent-type>/       # Agent Dockerfile (e.g., claude-code-agent)
│   ├── Dockerfile
│   ├── workspace/
│   └── home/
├── node_modules/       # Shared framework packages
├── package.json
└── .bin/
```

If a role's Docker artifacts are missing or outdated, Mason regenerates them before starting the containers. You generally don't need to manage this directory by hand.

## Sessions

Each `mason run` invocation creates a session in `.mason/sessions/`. A session captures the Docker Compose configuration and logs for that specific run.

```
.mason/sessions/<session-id>/
├── docker/
│   ├── docker-compose.yml    # Compose config for this run
│   └── .env                  # Environment variables (tokens, etc.)
└── logs/                     # Captured output
```

Session IDs are short random hex strings. Sessions persist after the run completes so you can inspect logs and debug issues.

## Startup Sequence

When you run `mason run <agent-type> --role <name>`, the following happens:

1. **Pre-flight checks** — Verify Docker Compose is available
2. **Ensure `.mason/config.json`** — Create the agent registry if it doesn't exist
3. **Discover the role** — Search local roles, then installed packages
4. **Generate Docker artifacts** — Build Dockerfiles and install dependencies if needed
5. **Create a session** — Set up `.mason/sessions/<id>/` with compose config
6. **Start the MCP proxy** — Build and launch the proxy container (detached)
7. **Start the credential service** — Run in-process on the host
8. **Start the agent container** — Launch interactively or in ACP mode

See [Architecture](architecture.md) for the full sequence diagram.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MASON_HOME` | `~/.mason` | Root directory for mason data |
| `LODGE` | Auto-detected | Current lodge name |
| `LODGE_HOME` | `$MASON_HOME/$LODGE` | Current lodge directory |

CLI flags take precedence over environment variables, which take precedence over defaults.

## Related

- [Getting Started](get-started.md) — Walk through the full setup process
- [Architecture](architecture.md) — Runtime sequence diagrams
- [Role](role.md) — How roles are defined
- [CLI Reference](cli.md) — Full command reference
