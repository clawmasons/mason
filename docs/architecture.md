---
title: Runtime Architecture
description: How mason orchestrates agent execution at runtime
---

# Runtime Architecture

Mason uses a two-container model for agent execution: an **MCP Proxy** for tool filtering and a containerized **Agent** running the AI runtime. The **Credential Service** runs in-process on the host for secure secret management.

## Container Architecture

```mermaid
graph TB
    CLI["mason run"]
    CLI -->|docker compose up| Proxy["MCP Proxy<br/>(tool filtering + audit)"]
    CLI -->|docker compose run| Agent["Agent Container<br/>(Claude Code / pi-coding-agent / MCP Agent)"]
    CLI -.-|in-process| CredSvc["Credential Service<br/>(secret resolution)"]

    Agent -->|MCP protocol| Proxy
    CredSvc -->|WebSocket| Proxy
    Proxy -->|stdio / SSE / HTTP| App1["App: filesystem"]
    Proxy -->|stdio / SSE / HTTP| App2["App: github"]
    Proxy -->|stdio / SSE / HTTP| AppN["App: ..."]
```

## Role Startup Sequence

When you run `mason run <agent-type> --role <name>`, the following sequence executes. See [Initialization](initialization.md) for details on how the `.mason` directory is set up before this point.

```mermaid
sequenceDiagram
    participant CLI as mason CLI
    participant DC as Docker Compose
    participant Proxy as MCP Proxy
    participant CS as Credential Service (in-process)
    participant AE as Agent Entry
    participant Agent as Agent Runtime

    CLI->>CLI: Initialization
    CLI->>CLI: Generate docker-compose.yml
    CLI->>DC: docker compose up proxy (detached)
    DC->>Proxy: Start proxy on port 9090
    Proxy->>Proxy: Connect to upstream MCP apps
    CLI->>CS: Start credential service in-process
    CS->>Proxy: Connect via WebSocket
    CLI->>DC: docker compose run agent (interactive)
    DC->>AE: Start agent-entry bootstrap
    AE->>Proxy: POST /connect-agent (Bearer token)
    Proxy-->>AE: { sessionToken, sessionId }

    loop For each declared credential
        AE->>Proxy: credential_request(key, sessionToken)
        Proxy->>CS: Forward via WebSocket
        CS->>CS: Resolve from env / keychain / .env
        CS-->>Proxy: Credential value
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
    participant Proxy as MCP Proxy
    participant Router as Tool Router
    participant Audit as Audit Hook
    participant App as Upstream App

    Agent->>Proxy: callTool("github_create_pr", args)
    Proxy->>Router: Unprefix: "github_create_pr" → app: "github", tool: "create_pr"
    Router->>Router: Check role permissions (allow/deny)

    alt Tool denied
        Router-->>Agent: Error: tool not permitted
    else Tool allowed
        Audit->>Audit: Log pre-call (tool, args, timestamp)
        Router->>App: callTool("create_pr", args)
        App-->>Router: Result
        Audit->>Audit: Log post-call (result, duration, status)
        Router-->>Agent: Result
    end
```

## Credential Resolution Flow

Credentials are never stored in environment variables or Docker configuration:

```mermaid
sequenceDiagram
    participant Agent as Agent Runtime
    participant Proxy as MCP Proxy
    participant CS as Credential Service
    participant Audit as Audit Log

    Agent->>Proxy: credential_request("GITHUB_TOKEN", sessionToken)
    Proxy->>Proxy: Validate session token
    Proxy->>CS: Forward request via WebSocket

    CS->>CS: Check credential is declared by role

    alt Not declared
        CS->>Audit: Log DENIED (undeclared)
        CS-->>Proxy: Error: credential not declared
    else Declared
        CS->>CS: Resolve priority: session > env > keychain > .env
        CS->>Audit: Log GRANTED (source: env)
        CS-->>Proxy: Credential value
    end

    Proxy-->>Agent: Credential value
```

## ACP Mode Architecture

In ACP (Agent Communication Protocol) mode (`mason run <agent-type> --role <name> --acp`), mason integrates directly with editors:

```mermaid
sequenceDiagram
    participant Editor as Editor (Zed / JetBrains)
    participant Bridge as ACP Bridge
    participant DC as Docker Compose
    participant Proxy as MCP Proxy
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
| **claude-code-agent** | `claude` | `.claude/` directory, `AGENTS.md`, `settings.json`, slash commands, skill files, Dockerfile |
| **pi-coding-agent** | `pi` | pi-coding-agent configuration, instruction files, Dockerfile |
| **mcp-agent** | `mcp` | Minimal config for testing (no LLM required) |

The materializer reads the resolved role graph and produces everything the runtime needs, including Dockerfiles, configuration files, and mounted skill/prompt content. Custom agents can be registered in `.mason/config.json` by pointing to any npm package that implements the Agent Package SDK.

## Related

- [Initialization](initialization.md) — How lodges and runtime directories are set up
- [MCP Proxy](component-mcp-proxy.md) — Detailed proxy documentation
- [Credential Service](component-credential-service.md) — How credentials are resolved
- [Security](security.md) — The full security model
