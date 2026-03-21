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

How artifacts are delivered depends on the runtime materializer. The SDK provides `readSkills()` and `materializeSkills()` helpers that handle discovery and file copying based on `AgentSkillConfig`:
- **Claude Code** — Copied to `.claude/skills/{skill-name}/` (SKILL.md + companions)
- **pi-coding-agent** — Copied to `skills/{skill-name}/` (SKILL.md + companions)
- **MCP Agent** — Available as reference material

### Project-Folder Skill Discovery

Skills stored in an agent's project folder are discovered by `readSkills(config, projectDir)`. It walks `{projectDir}/{config.projectFolder}/`, treating each subdirectory containing a `SKILL.md` as a skill. All files in the directory (SKILL.md + templates, examples, schemas) are read into a `contentMap` and materialized verbatim by `materializeSkills()`.

```typescript
import type { AgentSkillConfig } from "@clawmasons/agent-sdk";

const skillConfig: AgentSkillConfig = {
  projectFolder: ".claude/skills",
};

// Read skills from project folder
const skills = readSkills(skillConfig, "/path/to/project");

// Materialize to output
const files = materializeSkills(skills, skillConfig);
```

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
