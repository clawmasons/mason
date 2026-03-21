---
title: Task
description: Named prompt that agents execute as slash commands
---

# Task

A **task** is a named prompt that an agent can execute — typically surfaced as a slash command (e.g., `/triage` in Claude Code or a registered command in pi-coding-agent). Tasks are defined in a [role](role.md) and materialized as markdown files in the agent's project folder.

## How Tasks Work

1. A role declares tasks by name in its `tasks:` section
2. Each task is a markdown file with optional YAML frontmatter for metadata
3. The Agent Package SDK provides generic `readTasks()` and `materializeTasks()` functions
4. Each agent declares how it stores tasks via `AgentTaskConfig` in its `AgentPackage`
5. Tasks can be read from one agent format and written to another — enabling cross-agent portability

## ResolvedTask

After resolution, every task becomes a `ResolvedTask`:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Derived from the filename (without extension or scope prefix) |
| `version` | string | Yes | Semantic version |
| `displayName` | string | No | Human-friendly name (from frontmatter `name` field) |
| `description` | string | No | Brief description of the task |
| `category` | string | No | Grouping category |
| `tags` | string[] | No | Searchable tags |
| `scope` | string | No | Colon-delimited scope (e.g., `ops:triage`) |
| `prompt` | string | No | The actual prompt content (markdown body) |

**Key rule**: `name` is always derived from the filename, never from frontmatter. If a frontmatter `name` field exists, it maps to `displayName`.

## AgentTaskConfig

Each agent package declares how it stores task files via `AgentTaskConfig`:

```typescript
interface AgentTaskConfig {
  projectFolder: string;       // e.g., ".claude/commands"
  nameFormat: string;          // e.g., "{scopePath}/{taskName}.md"
  scopeFormat: "path" | "kebab-case-prefix";
  supportedFields: "all" | string[];  // frontmatter fields
  prompt: "markdown-body";
}
```

### Scope Formats

| Format | Layout | Example |
|--------|--------|---------|
| `path` | Nested directories | `.claude/commands/ops/triage/fix-bug.md` |
| `kebab-case-prefix` | Flat with prefix | `.pi/prompts/ops-triage-fix-bug.md` |

No-scope tasks go directly in the `projectFolder` root (no prefix, no subdirectory).

### Field Mapping

The `supportedFields` array controls which `ResolvedTask` properties appear in YAML frontmatter. Use `->` syntax to map a frontmatter key to a different property:

- `"description"` — frontmatter key `description` maps to property `description`
- `"name->displayName"` — frontmatter key `name` maps to property `displayName`
- `"all"` — includes all metadata fields with their default keys

### Agent Examples

**Claude Code** (`path` scope, rich frontmatter):
```typescript
tasks: {
  projectFolder: ".claude/commands",
  nameFormat: "{scopePath}/{taskName}.md",
  scopeFormat: "path",
  supportedFields: ["name->displayName", "description", "category", "tags"],
  prompt: "markdown-body",
}
```

**pi-coding-agent** (`kebab-case-prefix`, minimal frontmatter):
```typescript
tasks: {
  projectFolder: ".pi/prompts",
  nameFormat: "{scopeKebab}-{taskName}.md",
  scopeFormat: "kebab-case-prefix",
  supportedFields: ["description"],
  prompt: "markdown-body",
}
```

## Task File Format

A task file is a markdown file with optional YAML frontmatter:

```markdown
---
name: Triage Issues
description: Triage and label incoming GitHub issues
category: ops
tags:
  - ops
  - triage
---
You are a triage agent. Review the incoming issue and...
```

The markdown body after the frontmatter is the task prompt.

## Related

- [Role](role.md) — Roles reference tasks to make them available
- [App](app.md) — Tools available to the agent
- [Skill](skill.md) — Knowledge the agent uses
