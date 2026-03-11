---
title: Core Concepts
description: The mental model behind clawmasons agent packaging
---

# Core Concepts

Clawmasons organizes AI agents using a hierarchy of composable npm packages. Each package type serves a specific purpose in the governance model.

## Hierarchy

```
Lodge (organizational container)
  └── Chapter (npm workspace)
        └── Agent (deployable unit)
              └── Role (permission boundary)
                    ├── Task (unit of work)
                    │     ├── App (MCP server / tools)
                    │     └── Skill (knowledge artifact)
                    ├── App (direct dependency)
                    └── Skill (direct dependency)
```

## The Five Package Types

Every component is a standard npm package with a `chapter` field in its `package.json`:

| Type | Purpose | Key Responsibility |
|------|---------|-------------------|
| [App](chapter-app.md) | MCP server | Provides tools to agents |
| [Skill](chapter-skill.md) | Knowledge artifact | Provides context and conventions |
| [Task](chapter-task.md) | Unit of work | Defines what agents do |
| [Role](chapter-role.md) | Permission boundary | Controls what agents can access |
| [Agent](chapter-agent.md) | Deployable unit | Combines roles with runtime config |

## How They Compose

An **agent** references one or more **roles** as npm dependencies. Each role declares which **tasks**, **skills**, and **apps** it uses, along with **permissions** that gate tool access.

When an agent runs, the system resolves the full dependency tree, starts the required MCP servers (apps), and configures the proxy to enforce the role's permission rules.

```json
{
  "chapter": {
    "type": "agent",
    "runtimes": ["claude-code"],
    "roles": ["@acme/role-writer"]
  }
}
```

The role `@acme/role-writer` might reference the task `@acme/task-take-notes`, which requires the app `@acme/app-filesystem`. The role's permissions then specify exactly which filesystem tools the agent can use.

## Organizational Containers

| Concept | Purpose | Details |
|---------|---------|---------|
| [Lodge](lodge.md) | Organizational container | Governance boundary with a charter |
| [Chapter](chapter.md) | npm workspace | Development workspace containing packages |

## Everything Is a package.json

The `chapter` field in `package.json` is the single source of truth for each component's configuration. This means:

- **Standard tooling** — npm install, publish, version, and workspace management all work
- **Composability** — Reference other packages by npm name
- **Portability** — Packages can be published to any npm registry
- **Type safety** — All fields are validated with Zod schemas

## Next Steps

- Start with [Agent](chapter-agent.md) to understand the top-level deployable unit
- Read [Role](chapter-role.md) to understand the permission model
- See [Architecture](architecture.md) for how it all runs at runtime
