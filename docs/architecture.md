---
title: Runtime Architecture
description: How mason orchestrates agent execution at runtime
---

# Runtime Architecture

Mason uses a two-container model for agent execution: a **Docker-Side Proxy** for tool filtering and a containerized **Agent** running the AI runtime. A **Host Proxy** runs in-process on the host for credential resolution, approval dialogs, audit logging, and host MCP server management. The two sides communicate over a unified **relay WebSocket**.

## Container Architecture

```mermaid
graph TB
    CLI["mason run"]
    CLI -->|docker compose up| Proxy["Docker Proxy<br/>(tool filtering + audit)"]
    CLI -->|docker compose run| Agent["Agent Container<br/>(Claude Code / pi-coding-agent / MCP Agent)"]
    CLI -.-|in-process| HostProxy["Host Proxy<br/>(credentials, approvals, audit, host MCP)"]

    Agent -->|MCP protocol| Proxy
    HostProxy -->|WebSocket /ws/relay| Proxy
    Proxy -->|stdio / SSE / HTTP| App1["App: filesystem"]
    Proxy -->|stdio / SSE / HTTP| App2["App: github"]
    HostProxy -->|stdio| HostApp["Host App: xcode-sim"]
```

## Role Startup Sequence

When you run `mason run <agent-type> --role <name>`, the following sequence executes. See [Initialization](initialization.md) for details on how the `.mason` directory is set up before this point.

```mermaid
sequenceDiagram
    participant CLI as mason CLI
    participant DC as Docker Compose
    participant Proxy as Docker Proxy
    participant HP as Host Proxy (in-process)
    participant AE as Agent Entry
    participant Agent as Agent Runtime

    CLI->>CLI: Initialization
    CLI->>CLI: Generate docker-compose.yml
    CLI->>DC: docker compose up proxy (detached)
    DC->>Proxy: Start proxy on port 9090
    Proxy->>Proxy: Connect to upstream MCP apps
    CLI->>HP: Start host proxy in-process
    HP->>HP: Start host MCP servers (if any)
    HP->>Proxy: Connect via WebSocket /ws/relay
    HP->>Proxy: Register host MCP server tools
    CLI->>DC: docker compose run agent (interactive)
    DC->>AE: Start agent-entry bootstrap
    AE->>Proxy: POST /connect-agent (Bearer token)
    Proxy-->>AE: { sessionToken, sessionId }

    loop For each declared credential
        AE->>Proxy: credential_request(key, sessionToken)
        Proxy->>HP: credential_request (relay)
        HP->>HP: Resolve from env / keychain / .env
        HP-->>Proxy: credential_response (relay)
        Proxy-->>AE: Credential value
    end

    AE->>Agent: Spawn runtime with credentials in child env
    Agent->>Proxy: Connect MCP client
    Agent->>Proxy: listTools()
    Proxy-->>Agent: Filtered tools (role permissions applied)
```

## Tool Call Flow

Every tool call passes through the proxy for filtering and audit:

```mermaid
sequenceDiagram
    participant Agent as Agent Runtime
    participant Proxy as Docker Proxy
    participant Router as Tool Router
    participant Audit as Audit Hook
    participant App as Upstream App

    Agent->>Proxy: callTool("github_create_pr", args)
    Proxy->>Router: Unprefix: "github_create_pr" → app: "github", tool: "create_pr"
    Router->>Router: Check role permissions (allow/deny)

    alt Tool denied
        Router-->>Agent: Error: tool not permitted
    else Tool allowed
        Audit->>Audit: Send audit_event (pre-call) via relay
        Router->>App: callTool("create_pr", args)
        App-->>Router: Result
        Audit->>Audit: Send audit_event (post-call) via relay
        Router-->>Agent: Result
    end
```

## Approval Flow

When a tool call matches a role's `requireApprovalFor` pattern:

```mermaid
sequenceDiagram
    participant Agent as Agent Runtime
    participant Proxy as Docker Proxy
    participant HP as Host Proxy
    participant Dialog as macOS Dialog

    Agent->>Proxy: callTool("filesystem_write_file", args)
    Proxy->>Proxy: Match against approval patterns
    Proxy->>HP: approval_request (relay)
    HP->>Dialog: osascript display dialog
    Dialog-->>HP: User clicks Approve/Deny
    HP-->>Proxy: approval_response (relay)

    alt Approved
        Proxy->>Proxy: Execute tool call normally
        Proxy-->>Agent: Result
    else Denied
        Proxy-->>Agent: Error: tool call denied
    end
```

## Credential Resolution Flow

Credentials are never stored in environment variables or Docker configuration:

```mermaid
sequenceDiagram
    participant Agent as Agent Runtime
    participant Proxy as Docker Proxy
    participant HP as Host Proxy
    participant Resolver as Credential Resolver

    Agent->>Proxy: credential_request("GITHUB_TOKEN", sessionToken)
    Proxy->>Proxy: Validate session token
    Proxy->>HP: credential_request (relay)

    HP->>HP: Check credential is declared by role

    alt Not declared
        HP-->>Proxy: Error: credential not declared
    else Declared
        HP->>Resolver: Resolve priority: session > env > keychain > .env
        Resolver-->>HP: Credential value
        HP-->>Proxy: credential_response with value
    end

    Proxy-->>Agent: Credential value
```

## Host MCP Server Flow

MCP servers with `location: host` run on the host machine, with tool calls relayed through the proxy:

```mermaid
sequenceDiagram
    participant Agent as Agent Runtime
    participant Proxy as Docker Proxy
    participant HP as Host Proxy
    participant MCP as Host MCP Server

    Note over HP, MCP: During startup
    HP->>MCP: Spawn and connect
    HP->>MCP: listTools()
    MCP-->>HP: Tool definitions
    HP->>Proxy: mcp_tools_register (relay)
    Proxy-->>HP: mcp_tools_registered

    Note over Agent, MCP: During agent session
    Agent->>Proxy: callTool("xcode_run_simulator", args)
    Proxy->>HP: mcp_tool_call (relay)
    HP->>MCP: callTool("run_simulator", args)
    MCP-->>HP: Result
    HP-->>Proxy: mcp_tool_result (relay)
    Proxy-->>Agent: Result
```

## ACP Mode Architecture

In ACP (Agent Communication Protocol) mode (`mason run <agent-type> --role <name> --acp`), mason integrates directly with editors:

```mermaid
sequenceDiagram
    participant Editor as Editor (Zed / JetBrains)
    participant Bridge as ACP Bridge
    participant DC as Docker Compose
    participant Proxy as Docker Proxy
    participant Agent as Agent Container

    Editor->>Bridge: initialize (stdio/ndjson)
    Bridge->>Bridge: Handle locally (return capabilities)

    Editor->>Bridge: session/new { cwd: "/project" }
    Bridge->>DC: docker compose up (proxy + agent)
    DC->>Proxy: Start proxy
    DC->>Agent: Start agent (piped stdio)
    Bridge->>Agent: Forward session/new
    Agent-->>Bridge: Session established
    Bridge-->>Editor: Session ready

    loop Agent interaction
        Editor->>Bridge: Tool call / message
        Bridge->>Agent: Forward via stdio
        Agent->>Proxy: MCP tool call
        Proxy->>Proxy: Filter + audit
        Proxy-->>Agent: Result
        Agent-->>Bridge: Response
        Bridge-->>Editor: Response
    end
```

## Materializer Pattern

The same role definition is translated into runtime-specific configurations via the **Agent Package SDK**. Each agent runtime is an npm module (`@clawmasons/<agent>`) that exports an `AgentPackage` with a `RuntimeMaterializer`. The CLI discovers and loads them at runtime via the `AgentRegistry`.

| Runtime | Aliases | Generated Artifacts |
|---------|---------|-------------------|
| **claude-code-agent** | `claude` | `.claude/` directory, `settings.json`, slash commands, skill files (SKILL.md + companions), Dockerfile |
| **pi-coding-agent** | `pi` | pi-coding-agent configuration, instruction files, Dockerfile |
| **mcp-agent** | `mcp` | Minimal config for testing (no LLM required) |

The materializer reads the resolved role graph and produces everything the runtime needs, including Dockerfiles, configuration files, and mounted skill/prompt content. Custom agents can be registered in `.mason/config.json` by pointing to any npm package that implements the Agent Package SDK.

### Task Read/Write Flow

Tasks are read from a source agent's project folder and written to a target agent's format. The Agent Package SDK provides generic `readTasks()` and `materializeTasks()` functions that use each agent's `AgentTaskConfig` to handle format differences automatically.

```
Source Agent Files          ResolvedTask[]           Target Agent Files
─────────────────          ──────────────           ──────────────────
.claude/commands/           readTasks()              .pi/prompts/
  ops/                    ─────────────►              ops-triage-fix-bug.md
    triage/                 name: fix-bug             ops-triage-review.md
      fix-bug.md            scope: ops:triage
      review.md             prompt: "..."           materializeTasks()
                            ...                   ◄─────────────────
```

Each `AgentPackage` declares an `AgentTaskConfig` that specifies:
- **projectFolder**: Where task files live (e.g., `.claude/commands`)
- **nameFormat**: How filenames are constructed (e.g., `{scopePath}/{taskName}.md`)
- **scopeFormat**: Whether scope uses directories (`path`) or kebab prefixes (`kebab-case-prefix`)
- **supportedFields**: Which metadata fields appear in YAML frontmatter
- **prompt**: Where the prompt content lives (currently `markdown-body`)

See [Task](task.md) for the full task model documentation.

### Skill Read/Write Flow

Skills are static file trees (SKILL.md + optional companions like templates, examples, schemas) that are copied verbatim between agent formats. The SDK provides `readSkills()` and `materializeSkills()` functions driven by each agent's `AgentSkillConfig`.

```
Source Agent Files          ResolvedSkill[]          Target Agent Files
─────────────────          ───────────────          ──────────────────
.mason/skills/              readSkills()             .claude/skills/
  labeling/               ─────────────►              labeling/
    SKILL.md                name: labeling              SKILL.md
    examples/               contentMap: {...}           examples/
      example1.md           artifacts: [...]              example1.md
                                                    materializeSkills()
                                                  ◄─────────────────
```

Each `AgentPackage` declares an `AgentSkillConfig` with:
- **projectFolder**: Where skill directories live (e.g., `.claude/skills`)

Unlike tasks, skills require no per-agent transformation — files are copied verbatim. Content is populated by `resolveSkillContent()` in the CLI orchestrator before materialization.

See [Skill](skill.md) for the full skill model documentation.

## Related

- [Initialization](initialization.md) — How lodges and runtime directories are set up
- [Proxy](proxy.md) — Detailed proxy documentation
- [Security](security.md) — The full security model
