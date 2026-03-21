---
title: Adding a New Agent
description: Guide to creating an AgentPackage for a new AI runtime
---

# Adding a New Agent

This guide covers how to add support for a new AI agent runtime to mason by implementing the `AgentPackage` interface from `@clawmasons/agent-sdk`.

## Overview

Each agent runtime is an npm package that exports an `AgentPackage`. The CLI discovers and loads agent packages at runtime via the `AgentRegistry`. An agent package tells mason:

1. How to **materialize** workspace files for the runtime
2. How to **build** Docker containers for the runtime
3. How to **launch** the runtime at execution time
4. How to **read and write task files** in the runtime's native format

## Package Structure

```
packages/my-agent/
├── src/
│   ├── index.ts          # AgentPackage definition (default export)
│   └── materializer.ts   # RuntimeMaterializer implementation
├── tests/
│   └── materializer.test.ts
├── package.json
└── tsconfig.build.json
```

## AgentPackage Interface

```typescript
import type { AgentPackage } from "@clawmasons/agent-sdk";

const myAgent: AgentPackage = {
  name: "my-agent",
  aliases: ["my"],

  materializer: myAgentMaterializer,

  dockerfile: {
    installSteps: `
# Install my-agent runtime
RUN npm install -g my-agent-cli
`,
  },

  acp: {
    command: "my-agent-acp",
  },

  runtime: {
    command: "my-agent",
    args: ["--mode", "interactive"],
    credentials: [
      { key: "MY_AGENT_API_KEY", type: "env" },
    ],
  },

  tasks: {
    projectFolder: ".my-agent/prompts",
    nameFormat: "{scopePath}/{taskName}.md",
    scopeFormat: "path",
    supportedFields: ["description", "tags"],
    prompt: "markdown-body",
  },
};

export default myAgent;
```

## Task Configuration

The `tasks` field is an `AgentTaskConfig` that tells the SDK how your agent stores task files:

| Field | Description | Example |
|-------|-------------|---------|
| `projectFolder` | Directory for task files relative to workspace root | `.my-agent/prompts` |
| `nameFormat` | Filename template with tokens | `{scopePath}/{taskName}.md` |
| `scopeFormat` | How scope maps to filesystem | `"path"` or `"kebab-case-prefix"` |
| `supportedFields` | Which metadata goes in YAML frontmatter | `["description", "tags"]` or `"all"` |
| `prompt` | Where prompt content lives | `"markdown-body"` |

### Name Format Tokens

- `{taskName}` — The task name (e.g., `fix-bug`)
- `{scopePath}` — Scope as directory path (e.g., `ops/triage`)
- `{scopeKebab}` — Scope as kebab prefix (e.g., `ops-triage`)

### Scope Formats

**`"path"`** — Scope maps to nested directories. Use `{scopePath}` in `nameFormat`:
```
.my-agent/prompts/ops/triage/fix-bug.md  →  scope: "ops:triage", name: "fix-bug"
```

**`"kebab-case-prefix"`** — Flat directory with scope as filename prefix. Use `{scopeKebab}` in `nameFormat`:
```
.my-agent/prompts/ops-triage-fix-bug.md  →  scope: "ops:triage", name: "fix-bug"
```

### Field Mapping

Use `supportedFields` to control which `ResolvedTask` properties appear in frontmatter:

- `"description"` — maps frontmatter `description` to property `description`
- `"name->displayName"` — maps frontmatter `name` to property `displayName`
- `"all"` — includes all metadata fields (`displayName`, `description`, `category`, `tags`, `version`)

## RuntimeMaterializer

Implement the `RuntimeMaterializer` interface to generate workspace files:

```typescript
import type { RuntimeMaterializer, MaterializationResult } from "@clawmasons/agent-sdk";
import { materializeTasks } from "@clawmasons/agent-sdk";

const myAgentMaterializer: RuntimeMaterializer = {
  name: "my-agent",

  materializeWorkspace(agent, proxyEndpoint, proxyToken, options) {
    const result: MaterializationResult = new Map();
    const role = agent.roles[0];

    // Generate agent config
    result.set(".my-agent/config.json", JSON.stringify({
      proxy: proxyEndpoint,
      instructions: role.instructions,
    }, null, 2));

    // Materialize tasks using the SDK helper
    const agentPkg = getAgentPackage(); // reference to your AgentPackage
    if (agentPkg.tasks) {
      const taskFiles = materializeTasks(role.tasks, agentPkg.tasks);
      for (const [filePath, content] of taskFiles) {
        result.set(filePath, content);
      }
    }

    return result;
  },
};
```

The `materializeTasks()` SDK function handles all the filename resolution, frontmatter generation, and scope formatting based on your `AgentTaskConfig`.

## Registration

Register your agent package in `.mason/config.json`:

```json
{
  "agents": {
    "my-agent": {
      "package": "@myorg/mason-my-agent"
    }
  }
}
```

Or add it as a built-in by adding the package to the CLI's agent registry.

## Related

- [Task](task.md) — Task model and AgentTaskConfig details
- [Architecture](architecture.md) — Runtime architecture and materializer pattern
- [Role](role.md) — How roles reference tasks
