---
title: Skill
description: Knowledge artifacts that provide context to agents
---

# Skill

A **skill** is a knowledge artifact — documentation, conventions, examples, or reference material — that provides context to agents at runtime. Skills shape how an agent behaves without adding executable tools.

## Package Definition

```json
{
  "name": "@acme.platform/skill-markdown-conventions",
  "version": "1.0.0",
  "description": "Markdown formatting conventions for consistent note structure",
  "mason": {
    "type": "skill",
    "artifacts": ["./SKILL.md"],
    "description": "Markdown formatting conventions for consistent note structure"
  }
}
```

## Schema Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"skill"` | Yes | Package type identifier |
| `artifacts` | string[] | Yes | Paths to knowledge files (min 1) |
| `description` | string | Yes | What this skill provides |

### Artifacts

The `artifacts` array lists files that are injected into the agent's context at runtime. These are typically markdown files but can be any text format:

```json
{
  "artifacts": [
    "./SKILL.md",
    "./examples/good-example.md",
    "./reference/api-patterns.md"
  ]
}
```

How artifacts are delivered depends on the runtime materializer:
- **Claude Code** — Placed in the `skills/` directory of the agent workspace
- **pi-coding-agent** — Included in the agent's context configuration
- **MCP Agent** — Available as reference material

## Use Cases

- **Code conventions** — Formatting rules, naming patterns, architectural guidelines
- **Domain knowledge** — Business rules, API documentation, data schemas
- **Examples** — Good and bad patterns for the agent to follow
- **Templates** — Document structures, commit message formats, PR templates

## Best Practices

- Keep each skill focused on one topic
- Version skills independently — update conventions without changing tasks
- Compose multiple skills via [roles](role.md) for different contexts
- Write artifacts in clear, concise markdown that an LLM can follow

## Related

- [Task](task.md) — Tasks reference skills they need
- [Role](role.md) — Roles collect skills for permission boundaries
- [Concepts](concepts.md) — How skills fit in the package hierarchy
