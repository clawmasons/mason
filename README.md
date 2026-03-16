# Mason

Mason is a MIT licensed tool provided by Clawmasons, to help you run your agents in containers, ASAP


# Why?  
 1. skills are not to be trusted (npx skill add? OMG) [learn nore]
 2. LLMs are not to be trusted [learn more]
 3. Agent frameworks are not to be trusted (see #2) [learn more]
 4. If less people can be hacked, we will have less hackers putting shit out there [learn more]

# How we'll get there

`mason` combines security and productivity improvements to make it a no-brainer.

### How it improves your life
- **Define once, run on Any Agent, Anywhere** 
  - Continue to define skills in your agent of choice, mason can run them on any supported agent in a docker container  
  - Once mason roles are setup, anyone with access to your project can securily run their agents
- Seamless mcp server re-authentication [learn why this is easy for us]
- Launch project in a dev-container with agent enabled [learn more]
- [learn more about mason productivity improvements]

## How it improves security
 - **Docker Container** - First step, sandbox the agent into a container. Do this now even if you click away from this project.  
 - **Agents access scoped by Role** — Agents only see tools and skills, credentials their role permits
 - **MCP proxy** - MCP servers run on a different container and Agents never see the credentials.  
 - [learn more about security]


## Install

TODO: add prerequisits of 
  - docker
  - Claude Code installed, and CLAUDE_CODE_OAUTH_TOKEN exported (via claude setup-token)

  COMING soon  
  - use OPENROUTER_API_KEY  to run
    - opencode
    - codex
    - pi-mono-agent

```bash
npm install -g @clawmasons/mason
```

## Run your agent in a contianer
```
cd ~/your-project
mason 
mason claude
```

Congrats, you now have limited your agent to just your project instead of your whole computer

Notice: agent started with a prepacked role "setup" which will help you completely setup your project.
  - Define roles to control agent access [learn more about roles]
  - Setup operating system tools in your container, and MCP servers [learn more]
  - Add more agents to run your project 

Once setup is complete, you can run your project on any agent as any role.


## Quick Start


## How It Works

**Roles are the primary deployable unit.** A role is defined by a `ROLE.md` file — a markdown document with YAML frontmatter that declares the role's tasks, tools, permissions, container requirements, and system prompt.

Roles are composed from four npm package types:

| Type | Purpose |
|------|---------|
| **Role** | Deployable unit — tasks, tools, permissions, and system prompt |
| **App** | MCP server providing tools |
| **Skill** | Knowledge artifacts (prompts, conventions) |
| **Task** | Unit of work for the agent |

### ROLE.md Format

```yaml
---
name: create-prd
description: Creates product requirements documents
commands: ['define-change']
skills: ['@acme/skill-prd-writing']
mcp_servers:
  - name: github
    tools:
      allow: ['create_issue', 'create_pr']
container:
  packages:
    apt: ['jq']
risk: LOW
credentials: ['GITHUB_TOKEN']
---
```

The `ROLE.md` uses agent-native field names (e.g., `commands` for Claude Code, `instructions` for Codex). The system normalizes these to a generic representation (ROLE_TYPES) and can materialize the role for any supported runtime.

### Command Reference

| Command | Description |
|---------|-------------|
| `mason run <agent> --role <name>` | Run a role on the specified agent runtime |
| `mason <agent> --role <name>` | Shorthand for `run` |
| `mason run <agent> --role <name> --acp` | Run as an ACP server |
| `mason run <agent> --role <name> --dev-container` | Run a dev container with Agent enabled within VScode |

## Documentation

| Doc | Description |
|-----|-------------|
| [Overview](docs/overview.md) | What Mason is and why it matters |
| [Getting Started](docs/get-started.md) | Install and run your first role |
| [Core Concepts](docs/concepts.md) | Lodges, chapters, roles, tasks, skills, apps |
| [Architecture](docs/architecture.md) | Runtime architecture with sequence diagrams |
| [CLI Reference](docs/cli.md) | Complete command reference |
| [Security Model](docs/security.md) | Credentials, permissions, audit logging |
| [MCP Proxy](docs/component-mcp-proxy.md) | Tool filtering and routing |
| [Credential Service](docs/component-credential-service.md) | Secure credential resolution |

## Editor Integration

Use Vscode with a remote dev container
```bash
mason run claude --role writer --dev-container
```


Integrate with your editor via the Agent Communication Protocol:

```bash
mason run claude --role writer --acp
```

Works with Zed, JetBrains, Neovim, and any ACP-compatible client. See the [CLI reference](docs/cli.md#mason-run) for configuration details.

## Contributing

See [DEVELOPMENT.md](DEVELOPMENT.md) for build instructions, project structure, and the programmatic API.

## License

MIT
