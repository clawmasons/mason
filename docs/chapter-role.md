---
title: Role
description: Primary deployable unit defining tools, permissions, and system prompt
---

# Role

A **role** is the primary deployable unit in mason. It defines which [tasks](chapter-task.md), [skills](chapter-skill.md), and [apps](chapter-app.md) are available, sets explicit allow/deny lists for individual tools, and provides the system prompt for the agent runtime.

Roles are the security enforcement point in mason. The [MCP proxy](component-mcp-proxy.md) reads the role's permissions at runtime and filters tool access accordingly.

## ROLE.md Format

A role is defined by a `ROLE.md` file — a markdown document with YAML frontmatter for configuration and a markdown body for the system prompt.

```yaml
---
name: writer
description: A writing assistant with access to GitHub tools
commands: ['take-notes']
skills: ['@acme/skill-markdown-conventions']
mcp_servers:
  - name: github
    tools:
      allow: ['create_issue', 'list_repos']
      deny: ['delete_repo']
  - name: filesystem
    tools:
      allow: ['read_file', 'write_file', 'list_directory', 'create_directory']
container:
  packages:
    apt: ['jq']
  ignore:
    paths: ['node_modules', '.git', 'dist']
risk: LOW
credentials: ['GITHUB_TOKEN']
---

You are a technical writer. Help create clear, well-structured documentation.
```

### Field Reference

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string | Yes | — | Role identifier (used in `--role` flag) |
| `description` | string | No | — | What this role does |
| `commands` | string[] | No | — | Task/command references (Claude dialect) |
| `instructions` | string[] | No | — | Task/command references (Codex dialect) |
| `conventions` | string[] | No | — | Task/command references (Aider dialect) |
| `skills` | string[] | No | — | Skill package references |
| `mcp_servers` | object[] | No | — | MCP server tool permissions |
| `container` | object | No | — | Container configuration |
| `risk` | `"HIGH"` \| `"MEDIUM"` \| `"LOW"` | No | `"LOW"` | Risk level affecting session limits |
| `credentials` | string[] | No | `[]` | Credential keys needed at runtime |
| `constraints` | object | No | — | Execution constraints |

### Dialect Mapping

ROLE.md uses agent-native field names. The system normalizes these to a generic representation (ROLE_TYPES) and can materialize the role for any supported runtime.

| Generic (ROLE_TYPES) | Claude Code | Codex | Aider |
|----------------------|-------------|-------|-------|
| `tasks` | `commands` | `instructions` | `conventions` |
| `apps` | `mcp_servers` | `mcp_servers` | `mcp_servers` |
| `skills` | `skills` | `skills` | `skills` |

You can use any dialect's field names in your ROLE.md — the dialect registry maps them to the generic representation before materialization.

## Discovery and Precedence

Roles are discovered from two sources:

1. **Local ROLE.md files** — Found in agent-specific directories (e.g., `.claude/roles/<name>/ROLE.md`)
2. **Installed npm packages** — Role packages with `chapter.type: "role"` in `package.json`

Local roles take precedence over packaged roles with the same name. This allows you to override a published role with a local customization.

## Running a Role

```bash
# Run a role on Claude Code
mason run claude --role writer

# Shorthand
mason claude --role writer

# ACP mode for editor integration
mason run claude --role writer --acp
```

See [CLI Reference](cli.md) for full options.

## Volume Masking

The `container.ignore.paths` field controls which host paths are excluded from the agent's Docker volume mount:

```yaml
container:
  ignore:
    paths: ['node_modules', '.git', 'dist', '.env']
```

Listed paths are masked in the container, preventing the agent from accessing them even though the workspace is mounted.

## Package Definition

For packaged/published roles (npm packages), the role configuration lives in `package.json`:

```json
{
  "name": "@acme.platform/role-writer",
  "version": "1.0.0",
  "description": "Writer role — permission boundary for filesystem note operations",
  "chapter": {
    "type": "role",
    "description": "Manages notes on the filesystem: read, write, list, and create directories.",
    "tasks": ["@acme.platform/task-take-notes"],
    "skills": ["@acme.platform/skill-markdown-conventions"],
    "permissions": {
      "@acme.platform/app-filesystem": {
        "allow": ["read_file", "write_file", "list_directory", "create_directory"],
        "deny": []
      }
    }
  }
}
```

## Permissions

The `permissions` field (in package.json) or `mcp_servers` (in ROLE.md) maps apps to their tool access rules:

- **`allow`** — Tools the agent can use
- **`deny`** — Tools explicitly blocked (deny wins over allow)
- Apps not listed are inaccessible to the agent

### Risk Levels

| Level | Meaning |
|-------|---------|
| `LOW` | Standard operations, minimal blast radius |
| `MEDIUM` | Operations with moderate impact |
| `HIGH` | Sensitive operations, restricted session limits |

### Constraints

```json
{
  "constraints": {
    "maxConcurrentTasks": 3,
    "requireApprovalFor": ["delete_*", "push_*"]
  }
}
```

- `maxConcurrentTasks` — Maximum parallel task executions
- `requireApprovalFor` — Tool name patterns requiring human approval

## Related

- [Task](chapter-task.md) — Units of work available in a role
- [App](chapter-app.md) — MCP servers whose tools are gated by roles
- [MCP Proxy](component-mcp-proxy.md) — Enforces role permissions at runtime
- [Security](security.md) — The full security model
- [CLI Reference](cli.md) — Running roles from the command line
