---
title: Role
description: Permission boundary defining what tools an agent can access
---

# Role

A **role** is a permission boundary that controls what an [agent](chapter-agent.md) can do. It defines which [tasks](chapter-task.md), [skills](chapter-skill.md), and [apps](chapter-app.md) are available, and sets explicit allow/deny lists for individual tools.

Roles are the security enforcement point in clawmasons. The [MCP proxy](component-mcp-proxy.md) reads the role's permissions at runtime and filters tool access accordingly.

## Package Definition

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

## Schema Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `type` | `"role"` | Yes | — | Package type identifier |
| `description` | string | No | — | What this role permits |
| `risk` | `"HIGH"` \| `"MEDIUM"` \| `"LOW"` | No | `"LOW"` | Risk level affecting session limits |
| `tasks` | string[] | No | — | Task package references |
| `skills` | string[] | No | — | Skill package references |
| `permissions` | object | Yes | — | Per-app tool allow/deny lists |
| `constraints` | object | No | — | Execution constraints |
| `mounts` | object[] | No | — | Docker volume mounts |
| `baseImage` | string | No | — | Custom Docker base image |
| `aptPackages` | string[] | No | — | Additional apt packages for the container |

### Permissions

The `permissions` field maps app package names to their tool access rules:

```json
{
  "permissions": {
    "@acme/app-github": {
      "allow": ["create_pr", "list_issues", "add_comment"],
      "deny": ["delete_repo", "delete_branch"]
    },
    "@acme/app-filesystem": {
      "allow": ["read_file", "list_directory"],
      "deny": ["write_file"]
    }
  }
}
```

- **`allow`** — Tools the agent can use
- **`deny`** — Tools explicitly blocked (even if listed in allow)
- Apps not listed in permissions are inaccessible to the agent

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

### Mounts

Docker volume mounts for the agent container:

```json
{
  "mounts": [
    { "source": "./data", "target": "/workspace/data", "readonly": false },
    { "source": "./config", "target": "/workspace/config", "readonly": true }
  ]
}
```

## How Roles Compose

An [agent](chapter-agent.md) references one or more roles. When the agent runs with a specific role, only that role's permissions, tasks, and skills are active. This allows the same agent to operate under different permission sets:

```bash
# Run with writer permissions
clawmasons agent note-taker writer

# Run with reviewer permissions (different role, same agent)
clawmasons agent note-taker reviewer
```

## Related

- [Agent](chapter-agent.md) — The deployable unit that uses roles
- [Task](chapter-task.md) — Units of work available in a role
- [App](chapter-app.md) — MCP servers whose tools are gated by roles
- [MCP Proxy](component-mcp-proxy.md) — Enforces role permissions at runtime
- [Security](security.md) — The full security model
