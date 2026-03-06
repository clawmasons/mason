# Agent Forge System (forge) — Product Requirements Document

**Version:** 0.2.0 · Draft  
**Date:** March 2026  
**Author:** ClawForge, Inc.

---

## 1. Executive Summary

The Agent Forge System (forge) is a thin wrapper around npm that adds AI agent semantics to the existing npm ecosystem. Every agent component — apps, tasks, skills, roles, and agents themselves — is a standard npm package extended with a `forge` metadata field. This gives forge the full power of npm's dependency resolution, versioning, workspaces, and registry infrastructure while layering on the runtime scaffolding, permission governance, and multi-runtime support that AI agent deployments require.

forge solves three problems simultaneously:

- **Packaging:** Agent components are versioned, composable npm packages with semantic dependency management.
- **Governance:** Roles declare explicit tool-level permissions. A generated [tbxark/mcp-proxy](https://github.com/tbxark/mcp-proxy/) instance enforces least-privilege access via `toolFilter` at the network layer. All app MCP servers for all roles are aggregated behind a single proxy endpoint.
- **Runtime Portability:** Agents declare supported runtimes (Claude Code, Codex, Aider, etc.). forge materializes the correct workspace configuration for each, all backed by the same proxy infrastructure.

---

## 2. Design Principles

- **npm-native:** Every forge package is a valid npm package. forge delegates all dependency resolution, versioning, and registry operations to npm.
- **Governance as code:** Permissions are declared in package metadata. forge generates a tbxark/mcp-proxy `config.json` with `toolFilter` entries computed from role permissions — not by trust in the runtime.
- **Runtime-agnostic:** The same agent definition can target multiple AI runtimes. Each runtime gets a materialized workspace, but all share the same proxy and tool boundary.
- **Single proxy, all apps:** One tbxark/mcp-proxy Docker container aggregates all MCP app servers needed by all of the agent's roles. App servers run inside the proxy container via stdio (`npx`/`uvx`) or connect as remote SSE/streamable-http upstreams. No separate app containers.
- **Declarative over imperative:** Agent definitions describe what an agent can do, not how to wire it up. forge generates all runtime plumbing from declarations.
- **Monorepo-first:** npm workspaces enable a monorepo where all agent components live together and are independently publishable.

---

## 3. Package Taxonomy

forge defines five package types. Each is a standard npm package whose `package.json` includes a `forge` field declaring its type and type-specific metadata.

| Type | Purpose | Depends On |
|------|---------|------------|
| **app** | MCP server exposing tools to agents | npm runtime deps only |
| **skill** | Knowledge/context artifacts (prompts, examples, reference docs) | Other skills |
| **task** | A unit of work: command, subagent invocation, or composite | Apps, skills, other tasks |
| **role** | Permission-bounded bundle of tasks, apps, and skills | Tasks, apps, skills |
| **agent** | Top-level deployable unit with roles, runtimes, and resources | Roles |

### 3.1 Dependency Graph

The typed dependency graph flows strictly downward. Higher-level types depend on lower-level types, never the reverse:

```
agent
  └─ role (declares permissions = tool allow-lists per app)
       ├─ task (declares which apps + skills it requires)
       │    ├─ app    (npm dep → MCP server code)
       │    ├─ skill  (npm dep → prompt/knowledge artifacts)
       │    └─ task   (sub-tasks for composite workflows)
       ├─ app   (direct role-level dependencies)
       └─ skill (direct role-level dependencies)
```

### 3.2 Package Type: app

An app is an MCP server that exposes tools. At runtime, apps are configured as `mcpServers` entries inside the tbxark/mcp-proxy `config.json`. They run inside the proxy container via stdio (using `npx` to launch the server's entrypoint) or connect as remote SSE/streamable-http upstreams. Apps do not run as separate Docker containers.

**stdio example:**

```json
{
  "name": "@clawmasons/app-github",
  "version": "1.2.0",
  "forge": {
    "type": "app",
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
    },
    "tools": [
      "create_issue", "list_repos", "create_pr",
      "get_pr", "create_review", "add_label",
      "delete_repo", "transfer_repo"
    ],
    "capabilities": ["resources", "tools"]
  }
}
```

**Remote (SSE) example:**

```json
{
  "name": "@clawmasons/app-amap",
  "version": "1.0.0",
  "forge": {
    "type": "app",
    "transport": "sse",
    "url": "https://mcp.amap.com/sse?key=${AMAP_KEY}",
    "tools": ["get_directions", "search_places"],
    "capabilities": ["tools"]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `transport` | enum | One of: `stdio`, `sse`, `streamable-http`. Determines how the proxy launches or connects to this server. |
| `command` | string | For stdio transport: the command to execute (e.g., `npx`, `uvx`, `node`). |
| `args` | string[] | For stdio transport: command arguments. Supports environment variable interpolation. |
| `url` | string | For sse/streamable-http transport: the remote server URL. |
| `env` | object | Environment variables for the server process. Values support `${VAR}` interpolation from `.env`. |
| `tools` | string[] | Exhaustive list of all tool names this server exposes. Used for validation and toolFilter generation. |
| `capabilities` | string[] | MCP capabilities this server supports (resources, tools, prompts). |

### 3.3 Package Type: skill

A skill is a pure knowledge artifact — prompts, examples, reference documentation, and context that tasks and roles can consume. Skills contain no executable code. They are materialized into the runtime workspace as files.

```json
{
  "name": "@clawmasons/skill-labeling",
  "version": "1.0.0",
  "forge": {
    "type": "skill",
    "artifacts": ["./SKILL.md", "./examples/", "./schemas/"],
    "description": "Issue labeling taxonomy and heuristics"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `artifacts` | string[] | Glob patterns or paths to files/directories included in the skill bundle. |
| `description` | string | Human-readable summary of what this skill provides. |

### 3.4 Package Type: task

A task is a unit of work the agent can execute. Tasks declare their type, the prompt or script that drives them, and the apps and skills they require. Tasks map to slash commands in Claude Code, instruction files in Codex, and equivalent constructs in other runtimes.

```json
{
  "name": "@clawmasons/task-triage-issue",
  "version": "0.3.1",
  "forge": {
    "type": "task",
    "taskType": "subagent",
    "prompt": "./prompts/triage.md",
    "requires": {
      "apps": ["@clawmasons/app-github"],
      "skills": ["@clawmasons/skill-labeling"]
    },
    "timeout": "5m",
    "approval": "auto"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `taskType` | enum | One of: `subagent`, `script`, `composite`, `human`. See 3.4.1. |
| `prompt` | string | Path to prompt template file (for subagent/human types). |
| `requires.apps` | string[] | App packages this task needs tools from. |
| `requires.skills` | string[] | Skill packages this task needs context from. |
| `timeout` | string | Maximum execution duration (e.g., `5m`, `1h`). Optional. |
| `approval` | enum | `auto` \| `confirm` \| `review`. Default: `auto`. |

#### 3.4.1 Task Types

- **subagent:** Spawns an LLM call with the task's prompt. The runtime's model handles execution. This is the most common type.
- **script:** Runs a deterministic script or program. No LLM involved. Entry point defined in the package's `main` field.
- **composite:** Chains other tasks sequentially or in parallel. Defined by a `tasks` array in the forge field with optional `parallel: true`.
- **human:** Pauses execution for human input or approval. The `prompt` field defines what to present to the human.

### 3.5 Package Type: role

A role is the governance boundary. It bundles tasks, declares which apps those tasks may access, and — critically — specifies the exact tool-level permissions for each app. The role's `permissions` field is the source of truth from which the tbxark/mcp-proxy `toolFilter` configuration is generated.

```json
{
  "name": "@clawmasons/role-issue-manager",
  "version": "2.0.0",
  "forge": {
    "type": "role",
    "description": "Manages GitHub issues: triage, label, assign.",
    "tasks": [
      "@clawmasons/task-triage-issue",
      "@clawmasons/task-assign-issue"
    ],
    "skills": ["@clawmasons/skill-labeling"],
    "permissions": {
      "@clawmasons/app-github": {
        "allow": ["create_issue", "list_repos", "add_label"],
        "deny": ["delete_repo", "transfer_repo"]
      },
      "@clawmasons/app-slack": {
        "allow": ["send_message"],
        "deny": ["*"]
      }
    },
    "constraints": {
      "maxConcurrentTasks": 3,
      "requireApprovalFor": ["assign_issue"]
    }
  }
}
```

**Permission Resolution:** The `allow` list is exhaustive. If a tool is not in `allow`, it is denied. The `deny` list provides explicit overrides and serves as documentation of intentionally excluded capabilities. `deny: ["*"]` means only the explicitly allowed tools are accessible.

### 3.6 Package Type: agent

An agent is the top-level deployable unit. It declares the roles the agent operates with, the runtimes it supports, and the resources it will access. This is the package that `forge install` targets.

```json
{
  "name": "@clawmasons/agent-repo-ops",
  "version": "1.0.0",
  "forge": {
    "type": "agent",
    "description": "Repository operations agent for GitHub.",
    "runtimes": ["claude-code", "codex"],
    "roles": [
      "@clawmasons/role-issue-manager",
      "@clawmasons/role-pr-reviewer"
    ],
    "resources": [
      {
        "type": "github-repo",
        "ref": "clawmasons/openclaw",
        "access": "read-write"
      }
    ],
    "proxy": {
      "image": "ghcr.io/tbxark/mcp-proxy:latest",
      "port": 9090,
      "type": "sse"
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `runtimes` | string[] | Supported runtime environments. forge scaffolds a workspace directory for each. |
| `roles` | string[] | Role packages this agent operates with. Defines the permission envelope. |
| `resources` | object[] | Declarations of external resources. Credentials bound at runtime, not in the package. |
| `proxy.image` | string | Docker image for the MCP proxy. Default: `ghcr.io/tbxark/mcp-proxy:latest`. |
| `proxy.port` | number | Port the proxy listens on. Default: `9090`. |
| `proxy.type` | string | Proxy transport type: `sse` or `streamable-http`. Default: `sse`. |

---

## 4. Monorepo Structure

forge supports a monorepo layout using npm workspaces. All agent components live in a single repository, organized by type, and are independently publishable.

```
my-agent-project/
├── package.json            # root workspace config
├── forge.config.json         # forge-specific build config
├── apps/
│   ├── github/
│   │   └── package.json    # forge.type = "app"
│   └── slack/
│       └── package.json
├── tasks/
│   ├── triage-issue/
│   │   └── package.json    # forge.type = "task"
│   └── assign-issue/
│       └── package.json
├── skills/
│   └── labeling/
│       └── package.json    # forge.type = "skill"
├── roles/
│   └── issue-manager/
│       └── package.json    # forge.type = "role"
└── agents/
    └── repo-ops/
        └── package.json    # forge.type = "agent"
```

Root `package.json`:

```json
{
  "private": true,
  "workspaces": [
    "apps/*", "tasks/*", "skills/*", "roles/*", "agents/*"
  ]
}
```

---

## 5. CLI Specification

The forge CLI wraps npm for package operations and adds agent-specific commands for building, installing, running, and validating agents.

### 5.1 Command Reference

| Command | Description |
|---------|-------------|
| `forge init` | Initializes a forge workspace. Runs `npm init`, creates `.forge/` directory, scaffolds `forge.config.json`. |
| `forge add <pkg>` | Wraps `npm install`. Validates the package has a `forge` field and compatible type. |
| `forge remove <pkg>` | Wraps `npm uninstall`. Checks for dependent packages before removing. |
| `forge build <agent>` | Walks the dependency graph, validates requirements, produces `forge.lock.json`. |
| `forge install <agent-pkg>` | `npm install` + resolves forge graph + scaffolds runtime directory with mcp-proxy config and workspace dirs. |
| `forge run <agent> [--runtime=X]` | Starts Docker Compose stack. If `--runtime` specified, only that runtime starts. Proxy always starts. |
| `forge stop <agent>` | Stops and tears down the Docker Compose stack. |
| `forge list` | Lists installed agents and their resolved role/task/app tree. |
| `forge permissions <agent>` | Displays the resolved permission matrix: role → app → allowed tools, and the generated toolFilter. |
| `forge validate <agent>` | Validates agent graph: checks all task requirements covered by role permissions. |
| `forge publish` | Wraps `npm publish`. Adds pre-publish validation of the `forge` field. |

### 5.2 forge init

Creates the foundational workspace structure:

```
$ forge init

my-workspace/
├── .forge/
│   ├── config.json       # workspace-level forge configuration
│   └── .env.example      # template for credential bindings
├── node_modules/
├── agents/               # runtime directories (created by forge install)
└── package.json
```

### 5.3 forge validate

Validation walks the agent's dependency graph and checks for the following:

- **Requirement coverage:** Every tool in a task's `requires.apps` must appear in the parent role's `permissions.allow` for that app.
- **Tool existence:** Every tool in a role's `permissions.allow` must exist in the corresponding app's `forge.tools` list.
- **Skill availability:** Every skill referenced by a task must be a dependency of either the task or its parent role.
- **Runtime support:** Each declared runtime must have a registered materializer.
- **Circular dependencies:** No circular references in the task dependency graph (especially for composite tasks).
- **App launch config:** Every app must have a valid `command`+`args` (for stdio) or `url` (for sse/streamable-http).

---

## 6. Runtime Architecture

When `forge install` scaffolds an agent, it generates a self-contained directory with a single tbxark/mcp-proxy Docker container that aggregates all app MCP servers, plus one workspace directory per declared runtime. The proxy is the only infrastructure container — app servers run inside it.

### 6.1 Scaffolded Directory Layout

```
repo-ops/
├── docker-compose.yml
├── .env                          # credential bindings (gitignored)
├── forge.lock.json                 # resolved dependency graph
│
├── mcp-proxy/
│   └── config.json               # tbxark/mcp-proxy config with all apps
│
├── claude-code/
│   ├── Dockerfile
│   └── workspace/
│       ├── .claude/
│       │   ├── settings.json     # MCP config → proxy
│       │   └── commands/         # tasks → slash commands
│       ├── AGENTS.md
│       └── skills/
│
├── codex/
│   ├── Dockerfile
│   └── workspace/
│       ├── codex.json
│       ├── instructions.md
│       └── skills/
│
└── shared/
    └── resources.json
```

There is no `apps/` directory with separate Dockerfiles. All app MCP servers are declared as `mcpServers` entries in `mcp-proxy/config.json`. The tbxark/mcp-proxy container launches stdio-based servers internally and connects to remote servers over the network.

### 6.2 Docker Compose Orchestration

The generated `docker-compose.yml` is streamlined to just two service categories: the proxy and the runtime containers.

#### 6.2.1 Service Categories

- **mcp-proxy:** Single `ghcr.io/tbxark/mcp-proxy` container. Runs all stdio-based app servers internally. Connects to remote app servers over the network. Exposes a single SSE or streamable-http endpoint to runtime containers. The `toolFilter` on each `mcpServer` entry enforces tool-level access control.
- **Runtime containers:** One container per declared runtime. Dockerfile installs the CLI tool (claude-code, codex, etc.). The `workspace/` directory is bind-mounted from the host. All runtimes point to the same proxy endpoint.
- **agent-net:** Isolated Docker bridge network connecting the proxy to runtime containers.

#### 6.2.2 Role Switching (Option A)

A single runtime container supports all roles declared by the agent. Since tbxark/mcp-proxy's `toolFilter` is configured per-`mcpServer` entry (not per-request), forge computes the `toolFilter` as the **union** of all tools allowed across all roles for each app. Per-role scoping is then enforced by the runtime's context layer: the `AGENTS.md` file, slash commands, and task prompts explicitly declare which tools each role may use, and the LLM respects these boundaries.

This creates a **two-tier governance model:**

- **Proxy layer (hard boundary):** The tbxark/mcp-proxy `toolFilter` blocks any tool not permitted by *any* role. This is the outer security perimeter. If a tool isn't in the union of all role allow-lists, no runtime can invoke it regardless of context.
- **Runtime layer (soft boundary):** `AGENTS.md` and task prompts scope the agent to the correct role's tool subset for each task. The LLM self-governs which tools to use based on the active role context.

```
# Proxy-level toolFilter (hard boundary)
github toolFilter.list = union of all roles = [create_issue, list_repos, add_label, get_pr, create_review]

# Runtime-level role context (soft boundary)
issue-manager → github: create_issue, list_repos, add_label
pr-reviewer   → github: list_repos, get_pr, create_review
```

**Security note:** The proxy-layer `toolFilter` guarantees that even if the LLM ignores the soft boundary, it cannot access tools outside the union of all roles. For agents where strict per-role isolation is critical, forge supports an alternative mode: one mcp-proxy instance per role, each with its own `config.json` and `toolFilter`. See section 6.5.

#### 6.2.3 Generated docker-compose.yml

```yaml
version: "3.8"

services:

  mcp-proxy:
    image: ghcr.io/tbxark/mcp-proxy:latest
    restart: unless-stopped
    ports:
      - "${FORGE_PROXY_PORT:-9090}:9090"
    volumes:
      - ./mcp-proxy/config.json:/config/config.json:ro
    environment:
      - GITHUB_TOKEN=${GITHUB_TOKEN}
      - SLACK_BOT_TOKEN=${SLACK_BOT_TOKEN}
    networks:
      - agent-net

  claude-code:
    build: ./claude-code
    restart: unless-stopped
    volumes:
      - ./claude-code/workspace:/workspace
    working_dir: /workspace
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - FORGE_ROLES=issue-manager,pr-reviewer
    depends_on:
      - mcp-proxy
    stdin_open: true
    tty: true
    networks:
      - agent-net

  codex:
    build: ./codex
    restart: unless-stopped
    volumes:
      - ./codex/workspace:/workspace
    working_dir: /workspace
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - FORGE_ROLES=issue-manager,pr-reviewer
    depends_on:
      - mcp-proxy
    stdin_open: true
    tty: true
    networks:
      - agent-net

networks:
  agent-net:
    driver: bridge
```

Environment variables for app credentials (`GITHUB_TOKEN`, `SLACK_BOT_TOKEN`) are passed to the `mcp-proxy` container, which forwards them to the stdio server processes it launches internally via `${VAR}` interpolation in `config.json`. No separate app containers exist.

### 6.3 tbxark/mcp-proxy Configuration

The `mcp-proxy/config.json` is the heart of the runtime. forge generates it by walking the agent's roles, collecting all referenced apps, and computing the `toolFilter` for each app as the union of all role allow-lists. The config follows the tbxark/mcp-proxy schema:

```json
{
  "mcpProxy": {
    "baseURL": "http://mcp-proxy:9090",
    "addr": ":9090",
    "name": "forge-proxy-repo-ops",
    "version": "1.0.0",
    "type": "sse",
    "options": {
      "panicIfInvalid": false,
      "logEnabled": true,
      "authTokens": ["${FORGE_PROXY_TOKEN}"]
    }
  },
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
      },
      "options": {
        "logEnabled": true,
        "toolFilter": {
          "mode": "allow",
          "list": [
            "create_issue",
            "list_repos",
            "add_label",
            "get_pr",
            "create_review"
          ]
        }
      }
    },
    "slack": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-slack"],
      "env": {
        "SLACK_BOT_TOKEN": "${SLACK_BOT_TOKEN}"
      },
      "options": {
        "toolFilter": {
          "mode": "allow",
          "list": ["send_message"]
        }
      }
    }
  }
}
```

#### 6.3.1 toolFilter Generation Algorithm

For each app referenced by any role in the agent, forge computes the `toolFilter` as follows:

1. Collect the `allow` list from every role that references this app.
2. Compute the **union** of all allow lists.
3. Set the `toolFilter` mode to `"allow"` and the list to the computed union.
4. Validate that every tool in the union exists in the app's `forge.tools` declaration.

**Example:** If `role-issue-manager` allows `[create_issue, list_repos, add_label]` on `app-github`, and `role-pr-reviewer` allows `[list_repos, get_pr, create_review]` on `app-github`, the generated toolFilter for `github` is:

```json
"toolFilter": {
  "mode": "allow",
  "list": ["create_issue", "list_repos", "add_label", "get_pr", "create_review"]
}
```

Tools that exist on the app but are not in any role's allow list (e.g., `delete_repo`, `transfer_repo`) are excluded from the filter and thus blocked by the proxy. This is the hard governance boundary.

#### 6.3.2 Proxy Authentication

tbxark/mcp-proxy supports `authTokens` for bearer-token authentication. forge generates a random `FORGE_PROXY_TOKEN` at install time and configures both the proxy and the runtime settings to use it. This prevents unauthorized access to the proxy endpoint from other containers or processes on the network.

### 6.4 Credential Binding

Agent packages never contain credentials. Resources in the agent definition are declarations. Actual credential binding happens at install/run time through one of three mechanisms:

- **Environment file:** The generated `.env` file maps environment variables consumed by mcp-proxy's env interpolation (`${VAR}` syntax). `forge install` prompts for values or reads from `FORGE_ENV_FILE`.
- **Secrets manager:** The `.forge/config.json` can specify a secrets provider (AWS Secrets Manager, Vault). `forge run` resolves secrets at startup and writes them to `.env`.
- **Credential sidecar:** For token lifecycle management (refresh, rotation), apps can declare a `credentialProvider` in their forge field. A sidecar process handles rotation and updates the proxy's environment.

### 6.5 Strict Per-Role Isolation (Alternative Mode)

For agents where the soft runtime-layer boundary is insufficient and hard per-role tool isolation is required, forge supports an alternative scaffolding mode: one mcp-proxy instance per role.

```
# forge install --strict-roles @clawmasons/agent-repo-ops

repo-ops/
├── docker-compose.yml
├── mcp-proxy-issue-manager/
│   └── config.json     # toolFilter = issue-manager allow-list only
├── mcp-proxy-pr-reviewer/
│   └── config.json     # toolFilter = pr-reviewer allow-list only
├── claude-code/
│   └── workspace/      # settings.json references both proxy endpoints
└── ...
```

In this mode, each proxy instance runs only the apps needed by that role, with `toolFilter` restricted to exactly that role's allow-list. The runtime's MCP settings reference multiple proxy endpoints, and task prompts specify which endpoint to use. The `docker-compose.yml` contains one mcp-proxy service per role, each with its own `config.json` volume mount.

This mode trades operational simplicity for stronger isolation. It is recommended for production deployments in regulated environments.

---

## 7. Runtime Materializers

A materializer is a plugin that translates the abstract forge dependency graph into a specific runtime's native configuration format. Materializers are registered with forge and invoked during `forge install` for each runtime declared by the agent.

### 7.1 Materializer Interface

```typescript
interface RuntimeMaterializer {
  name: string;

  // Generate workspace/ directory contents
  materializeWorkspace(
    targetDir: string,
    agent: ResolvedAgent,
    roles: ResolvedRole[],
    proxyEndpoint: string
  ): Promise<void>;

  // Generate the runtime Dockerfile
  generateDockerfile(agent: ResolvedAgent): string;

  // Generate docker-compose service definition
  generateComposeService(
    agent: ResolvedAgent,
    roles: ResolvedRole[]
  ): ComposeServiceDef;
}
```

### 7.2 Claude Code Materializer

Generates a workspace optimized for the Claude Code CLI's conventions.

#### 7.2.1 .claude/settings.json

Configures Claude Code to use the tbxark/mcp-proxy as its single MCP server:

```json
{
  "mcpServers": {
    "forge-proxy": {
      "type": "sse",
      "url": "http://mcp-proxy:9090/sse",
      "headers": {
        "Authorization": "Bearer ${FORGE_PROXY_TOKEN}"
      }
    }
  },
  "permissions": {
    "allow": ["mcp__forge-proxy__*"],
    "deny": []
  }
}
```

Claude Code sees a single MCP server (`forge-proxy`) that exposes all tools from all apps, already filtered by the proxy's `toolFilter`. The runtime's permission system allows all proxy tools, since the proxy itself is the enforcement layer.

#### 7.2.2 Slash Commands

Each task is materialized as a Claude Code slash command in `.claude/commands/`. The command header declares the active role, scoping the LLM to the correct tool subset:

```markdown
# .claude/commands/triage-issue.md
# Generated by forge from @clawmasons/task-triage-issue@0.3.1

## Role Context
You are operating as role: issue-manager
Permitted tools for this role:
  - github: create_issue, list_repos, add_label
  - slack: send_message
Do NOT use tools outside this list even if they appear available.

## Required Skills
See skills/labeling/SKILL.md for labeling taxonomy.

## Task
[contents of the task's prompt file]
```

#### 7.2.3 AGENTS.md

Provides Claude Code with the agent's identity, all roles, and per-role tool constraints:

```markdown
# Agent: repo-ops

You are an agent managed by forge (Agent Forge System).
You have multiple roles. Each task you execute specifies which
role is active. Only use tools permitted by the active role.

## Roles

### issue-manager
Manages GitHub issues: triage, label, assign.

**Permitted tools:**
- github: create_issue, list_repos, add_label
- slack: send_message

**Constraints:**
- Max concurrent tasks: 3
- Requires approval for: assign_issue

### pr-reviewer
Reviews pull requests and provides feedback.

**Permitted tools:**
- github: list_repos, get_pr, create_review
```

#### 7.2.4 Skills Directory

Skill artifacts are copied into `workspace/skills/{skill-name}/`, preserving the directory structure declared in the skill's `artifacts` field.

### 7.3 Codex Materializer

The Codex materializer follows the same pattern but targets OpenAI Codex's configuration format: `codex.json` (MCP config pointing to the proxy), `instructions.md` (role descriptions and constraints), and the same `skills/` directory.

### 7.4 Custom Materializers

Third-party materializers are registered via forge plugins — an npm package with `forge.type` of `"materializer"`:

```json
{
  "name": "@my-org/forge-materializer-aider",
  "version": "1.0.0",
  "forge": { "type": "materializer", "runtime": "aider" },
  "main": "./dist/materializer.js"
}
```

---

## 8. forge install Flow

The following sequence describes what happens when a user runs `forge install <agent-package>`:

1. **npm install:** Delegates to npm to install the agent package and all transitive dependencies into `node_modules/`.
2. **Graph resolution:** Reads the agent's `forge` field, walks the typed dependency graph (roles → tasks → apps + skills), produces a `ResolvedAgent` with all metadata flattened.
3. **Validation:** Runs the same checks as `forge validate`. Install aborts with actionable errors on failure.
4. **Compute toolFilters:** For each app, unions the allow-lists across all roles to produce the `toolFilter`. Validates all tools exist in the app's `forge.tools`.
5. **Generate mcp-proxy config:** Writes `mcp-proxy/config.json` with all app servers as `mcpServers` entries, each with its computed `toolFilter`, env vars with `${}` interpolation, and proxy-level options.
6. **Materialize runtimes:** For each runtime in the `runtimes` array, invokes the corresponding materializer to generate the Dockerfile and `workspace/` directory.
7. **Generate docker-compose.yml:** Assembles compose file with the mcp-proxy service and one service per runtime.
8. **Write forge.lock.json:** Snapshots the resolved graph with exact versions and generated file hashes.
9. **Credential prompting:** Generates `.env` template. Prompts for unfilled variables or reads from configured secrets provider.

---

## 9. Governance Model

forge enforces the ClawForge governance thesis: AI agents should operate under least-privilege access, with permissions declared in code and enforced at the infrastructure level.

### 9.1 Two-Tier Enforcement

Governance is enforced at two layers:

| Layer | Mechanism | Boundary | Enforced By |
|-------|-----------|----------|-------------|
| **Proxy** | tbxark/mcp-proxy `toolFilter` (`mode: allow`) | Hard | Network infrastructure. No tool call can bypass this filter. |
| **Runtime** | `AGENTS.md` + task prompts + slash commands | Soft | LLM context. The model self-governs based on role declarations. |

The proxy layer blocks the union complement — tools not in any role's allow-list are unreachable. The runtime layer scopes to the active role's subset. Together they enforce defense-in-depth.

### 9.2 Permission Resolution Algorithm

1. For each role, collect all `permissions` entries (app → allow/deny lists).
2. For each app, resolve the app's `forge.tools` list.
3. Validate every tool in each role's `allow` list exists in the app's tool list.
4. Validate every tool in a task's `requires.apps` is present in its parent role's `allow` list.
5. Compute the union of all allow-lists per app across all roles.
6. Generate the mcp-proxy config with `toolFilter: { mode: "allow", list: <union> }` for each app.
7. Generate `AGENTS.md` with per-role allow-lists for the runtime soft boundary.

### 9.3 Audit Logging

tbxark/mcp-proxy supports `logEnabled` per server and at the proxy level. When enabled, the proxy logs tool registration and invocation events. forge sets `logEnabled: true` on both `mcpProxy` and all `mcpServers` by default. Logs are written to the container's stdout and captured by Docker's logging driver.

For structured audit trails, forge generates a log configuration with rotation:

```yaml
  mcp-proxy:
    image: ghcr.io/tbxark/mcp-proxy:latest
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "5"
```

Log entries include tool registration (e.g., "Adding tool create_issue") and can be parsed for compliance reporting.

### 9.4 Validation as Governance Gate

`forge validate` integrates into CI/CD pipelines as a governance gate. A PR changing role permissions or task requirements triggers validation. If the configuration violates the permission model, the CI check fails. The generated `toolFilter` can be diffed in code review to audit permission changes.

---

## 10. Registry Strategy

- **Public registry (npmjs.com):** Open-source community packages published under the `@clawmasons` scope. Apps, skills, and tasks that are generally useful.
- **Private registry (Verdaccio or npm Enterprise):** Organization-specific packages. Roles and agents with proprietary task definitions or internal tool configurations.

npm's `.npmrc` scoping supports this natively — different scopes can resolve to different registries without any forge-level configuration.

---

## 11. Future Considerations

- **On-chain attestation:** Integration with the Open Governance Protocol for EAS-based attestations of agent permissions and audit events.
- **Hot-reload:** `forge watch` mode that regenerates the mcp-proxy `config.json` and restarts the proxy when source packages change.
- **Multi-agent orchestration:** Multiple agents in a single compose stack with separate mcp-proxy instances per agent, enforcing inter-agent isolation.
- **Marketplace / ClawdHub:** A discovery layer on top of the npm registry for browsing agent components by type, rating, and compatibility.
- **Resource providers:** Extending beyond `github-repo` to support databases, APIs, cloud services, and other resources with declarative access policies.
- **Runtime telemetry:** Standardized metrics export from proxy and runtime containers for observability dashboards.
- **Per-request role enforcement:** A custom proxy extension or middleware that reads the `X-FORGE-Role` header and applies per-role `toolFilter` dynamically, eliminating the soft boundary layer entirely.

---

## Appendix A: forge Field JSON Schema Reference

| Property | app | skill | task | role | agent |
|----------|-----|-------|------|------|-------|
| `type` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `description` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `transport` | ✓ | — | — | — | — |
| `command` | ✓ | — | — | — | — |
| `args` | ✓ | — | — | — | — |
| `url` | ✓ | — | — | — | — |
| `env` | ✓ | — | — | — | — |
| `tools` | ✓ | — | — | — | — |
| `capabilities` | ✓ | — | — | — | — |
| `artifacts` | — | ✓ | — | — | — |
| `taskType` | — | — | ✓ | — | — |
| `prompt` | — | — | ✓ | — | — |
| `requires` | — | — | ✓ | — | — |
| `timeout` | — | — | ✓ | — | — |
| `approval` | — | — | ✓ | — | — |
| `tasks` | — | — | — | ✓ | — |
| `permissions` | — | — | — | ✓ | — |
| `constraints` | — | — | — | ✓ | — |
| `runtimes` | — | — | — | — | ✓ |
| `roles` | — | — | — | — | ✓ |
| `resources` | — | — | — | — | ✓ |
| `proxy` | — | — | — | — | ✓ |

## Appendix B: tbxark/mcp-proxy Config Schema Reference

| Field | Location | Description |
|-------|----------|-------------|
| `mcpProxy.addr` | top-level | Listen address and port (e.g., `:9090`). |
| `mcpProxy.type` | top-level | Transport type: `sse` or `streamable-http`. |
| `mcpProxy.name` | top-level | Proxy server name (for MCP identification). |
| `mcpProxy.options.logEnabled` | top-level | Enable proxy-level logging. |
| `mcpProxy.options.authTokens` | top-level | Bearer tokens for proxy authentication. |
| `mcpServers.<name>.command` | per-server | Command to launch stdio-based server (e.g., `npx`). |
| `mcpServers.<name>.args` | per-server | Arguments for the command. |
| `mcpServers.<name>.url` | per-server | URL for remote sse/streamable-http servers. |
| `mcpServers.<name>.env` | per-server | Environment variables with `${}` interpolation. |
| `mcpServers.<name>.options.toolFilter.mode` | per-server | `allow` or `block`. forge always generates `allow`. |
| `mcpServers.<name>.options.toolFilter.list` | per-server | Tool names to allow (union of role allow-lists). |
| `mcpServers.<name>.options.logEnabled` | per-server | Enable per-server logging. |
| `mcpServers.<name>.options.panicIfInvalid` | per-server | Abort if server fails to connect. |

