# Clawmasons Chapter

npm-native packaging, governance, and runtime portability for AI agents.

## Why Clawmasons?

AI agents need tools, but tool access today is ungoverned. Credentials leak via environment variables. There's no audit trail. Agent definitions are locked to a single runtime.

Clawmasons solves this:

- **Credential isolation** — Secrets resolved on-demand, never in env vars or Docker inspect
- **Role-based tool filtering** — Agents only see tools their role permits
- **Audit logging** — Every tool call and credential access logged
- **Runtime portability** — Same definition works on Claude Code, Pi-coding-agent, and more
- **npm-native** — Everything is a `package.json` with standard npm tooling

## Install

```bash
npm install -g @clawmasons/chapter
```

## Quick Start

```bash
# Initialize a lodge (organizational container)
clawmasons init

# Create a chapter workspace with the note-taker template
clawmasons chapter init --name acme.platform --template note-taker
cd acme.platform

# Build the agent
clawmasons chapter build

# Run the agent interactively
clawmasons agent note-taker writer
```

This spins up an MCP proxy (tool filtering), credential service (secret management), and agent container — all governed by the role's permissions.

## How It Works

Agents are composed from five npm package types:

| Type | Purpose |
|------|---------|
| **App** | MCP server providing tools |
| **Skill** | Knowledge artifacts (prompts, conventions) |
| **Task** | Unit of work for the agent |
| **Role** | Permission boundary (tool allow/deny lists) |
| **Agent** | Deployable unit combining roles + runtime config |

Each package has a `chapter` field in its `package.json` that declares its configuration. Roles define which tools from which apps are accessible, and the MCP proxy enforces this at runtime.

## Documentation

| Doc | Description |
|-----|-------------|
| [Overview](docs/overview.md) | What clawmasons is and why it matters |
| [Getting Started](docs/get-started.md) | Install and run your first agent |
| [Core Concepts](docs/concepts.md) | Lodges, chapters, agents, roles, tasks, skills, apps |
| [Architecture](docs/architecture.mdx) | Runtime architecture with sequence diagrams |
| [CLI Reference](docs/cli.md) | Complete command reference |
| [Security Model](docs/security.md) | Credentials, permissions, audit logging |
| [MCP Proxy](docs/component-mcp-proxy.md) | Tool filtering and routing |
| [Credential Service](docs/component-credential-service.md) | Secure credential resolution |

## Editor Integration (ACP)

Integrate with your editor via the Agent Communication Protocol:

```bash
clawmasons acp --role writer
```

Works with Zed, JetBrains, Neovim, and any ACP-compatible client. See the [CLI reference](docs/cli.md#clawmasons-acp) for configuration details.

## Contributing

See [DEVELOPMENT.md](DEVELOPMENT.md) for build instructions, project structure, and the programmatic API.

## License

MIT
