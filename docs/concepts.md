---
title: Core Concepts
description: The mental model behind mason role packaging
---

# Core Concepts

Mason organizes AI agent roles using a hierarchy of composable npm packages. Each package type serves a specific purpose in the governance model.

## Hierarchy

```
Role (deployable unit / permission boundary)
  ├── Task (unit of work)
  │     ├── App (MCP server / tools)
  │     └── Skill (knowledge artifact)
  ├── App (direct dependency)
  └── Skill (direct dependency)
```

## The Four Package Types

Every component is a standard npm package with a `chapter` field in its `package.json`:

| Type | Purpose | Key Responsibility |
|------|---------|-------------------|
| [App](app.md) | MCP server | Provides tools to agents |
| [Skill](skill.md) | Knowledge artifact | Provides context and conventions |
| [Task](task.md) | Unit of work | Defines what agents do |
| [Role](role.md) | Deployable unit | Combines tasks, tools, permissions, and system prompt |

## How They Compose

A **role** declares which **tasks**, **skills**, and **apps** it uses, along with **permissions** that gate tool access.

When a role runs, the system resolves the full dependency tree, starts the required MCP servers (apps), and configures the proxy to enforce the role's permission rules.

A role can be defined as a local `ROLE.md` file:

```yaml
---
name: writer
description: A writing assistant with filesystem access
commands: ['take-notes']
skills: ['@acme/skill-markdown-conventions']
mcp_servers:
  - name: filesystem
    tools:
      allow: ['read_file', 'write_file', 'list_directory']
credentials: ['GITHUB_TOKEN']
---

You are a technical writer. Help create clear documentation.
```

Or as a published npm package with a `chapter` field in `package.json`:

```json
{
  "chapter": {
    "type": "role",
    "tasks": ["@acme/task-take-notes"],
    "permissions": {
      "@acme/app-filesystem": {
        "allow": ["read_file", "write_file", "list_directory"]
      }
    }
  }
}
```

The role `@acme/role-writer` might reference the task `@acme/task-take-notes`, which requires the app `@acme/app-filesystem`. The role's permissions then specify exactly which filesystem tools the agent can use.

## Everything Is a package.json

The `chapter` field in `package.json` is the single source of truth for each component's configuration. This means:

- **Standard tooling** — npm install, publish, version, and workspace management all work
- **Composability** — Reference other packages by npm name
- **Portability** — Packages can be published to any npm registry
- **Type safety** — All fields are validated with Zod schemas

For local development, roles can also be defined as `ROLE.md` files that bypass npm packaging entirely. See [Role](role.md) for the ROLE.md format.

## Next Steps

- Start with [Role](role.md) to understand the primary deployable unit
- Read [Architecture](architecture.md) for how it all runs at runtime
- See [Getting Started](get-started.md) to run your first role
