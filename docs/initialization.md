---
title: Initialization
description: How clawmasons sets up lodges, chapters, and runtime directories
---

# Initialization

Clawmasons uses a layered initialization process: **lodge** (organizational container), **chapter** (workspace), **build** (Docker artifacts), and **role** (runtime directory). Each step is idempotent — running it again safely skips what already exists.

## Lodge Initialization

```bash
clawmasons init
```

Creates the top-level organizational container at `~/.clawmasons/`:

```
~/.clawmasons/
├── config.json              # Registry of initialized lodges
├── .gitignore
└── <lodge>/
    ├── chapters/            # Chapter workspaces live here
    └── CHARTER.md           # Governance charter
```

The lodge name defaults to your system username. Override it with `--lodge <name>` or the `LODGE` environment variable.

`config.json` maps lodge names to their home directories:

```json
{
  "acme": { "home": "/Users/you/.clawmasons/acme" }
}
```

## Chapter Initialization

```bash
clawmasons chapter init --name acme.platform --template note-taker
```

Creates an npm workspace with the standard package directory layout:

```
acme.platform/
├── package.json               # Workspace root with npm workspaces
├── .clawmasons/
│   └── chapter.json           # Workspace metadata
├── agents/                    # Agent packages
├── roles/                     # Role packages
├── tasks/                     # Task packages
├── skills/                    # Skill packages
└── apps/                      # App packages (MCP servers)
```

The root `package.json` declares npm workspaces so all packages are linked:

```json
{
  "name": "@acme.platform/chapter",
  "private": true,
  "workspaces": ["apps/*", "tasks/*", "skills/*", "roles/*", "agents/*"]
}
```

`.clawmasons/chapter.json` stores workspace metadata:

```json
{
  "chapter": "acme.platform",
  "version": "0.1.0"
}
```

When you use a `--template`, the CLI copies template files into the workspace directories and runs `npm install` to link everything.

## Package Discovery

Before an agent can be built or run, the CLI discovers all chapter packages in the workspace:

1. Scans `apps/`, `tasks/`, `skills/`, `roles/`, and `agents/` directories
2. Scans `node_modules/` for published chapter packages
3. Reads each `package.json` and validates the `chapter` field
4. Workspace packages take precedence over `node_modules` versions

The result is a map of every available package and its configuration.

## Agent Resolution

With all packages discovered, the CLI resolves the full dependency graph for an agent:

1. Looks up the agent package and extracts its roles
2. For each role, resolves its tasks, skills, and app references
3. For each task, resolves its required apps and skills (with circular dependency detection)
4. Validates that all permission references point to real tools on real apps

The resolved graph contains everything needed to generate runtime artifacts.

## Build

```bash
clawmasons chapter build
```

The build step takes the resolved agent graph and produces deployable artifacts:

1. **Pack** — Builds all workspace packages into `dist/*.tgz`
2. **Docker init** — Generates Dockerfiles and a `docker/` directory with all dependencies
3. **Lock file** — Writes `chapter.lock.json` with the resolved dependency snapshot

After build, `chapter.json` is updated with the Docker build path:

```json
{
  "chapter": "acme.platform",
  "version": "0.1.0",
  "docker-build": "/path/to/docker/",
  "docker-registries": ["local"]
}
```

The generated `docker/` directory contains:

```
docker/
├── package.json
├── node_modules/              # Framework packages + packed chapters
├── proxy/<role>/Dockerfile
├── agent/<agent>/<role>/Dockerfile
└── credential-service/Dockerfile
```

## Role Initialization

```bash
clawmasons chapter init-role --role writer
```

Registers a role for host-wide use. This creates a runtime directory under the lodge and records the role in `~/.clawmasons/chapters.json`:

```
~/.clawmasons/<lodge>/
└── roles/<role>/
    ├── .clawmasons/role.json   # Role metadata
    ├── docker/
    │   └── docker-compose.yml  # Reusable compose template
    └── logs/                   # Session logs
```

The `chapters.json` registry tracks which chapter and agents each role belongs to, enabling the CLI to locate the correct Docker artifacts at runtime.

## Agent Startup

When you run `clawmasons agent <slug> <role>`, the CLI ties all of this together:

1. **Discovers** packages in the chapter workspace
2. **Resolves** the agent's full dependency graph
3. **Generates** a session-specific `docker-compose.yml`
4. **Starts** the MCP proxy container (detached)
5. **Starts** the credential service in-process
6. **Starts** the agent container (interactive or piped for ACP)

See [Architecture](architecture.md) for the full startup sequence diagram.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAWMASONS_HOME` | `~/.clawmasons` | Root directory for all clawmasons data |
| `LODGE` | System username | Current lodge name |
| `LODGE_HOME` | `$CLAWMASONS_HOME/$LODGE` | Current lodge directory |

CLI flags take precedence over environment variables, which take precedence over defaults.

## Related

- [Getting Started](get-started.md) — Walk through the full setup process
- [Chapter](chapter.md) — Workspace management details
- [Lodge](lodge.md) — Organizational containers
- [Architecture](architecture.md) — Runtime sequence diagrams
