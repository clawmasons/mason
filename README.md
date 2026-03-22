# Mason

Mason runs your agents in secure Docker containers scoped to what they need with [**Roles**](/docs/role.md).

## Prerequisites

`mason` is a TypeScript command-line tool that runs your agents in containers. You'll need three things:

- [**Docker**](https://docs.docker.com/get-docker/)
- [**Node.js**](docs/node-install.md)
- [**Supported Agent**](docs/agents.md)


## Quick Start

### 1. Install mason globally
```bash
npm install -g @clawmasons/mason
```

### 2. Run your agent in a container

Run a project configured for claude code in a secure container
```bash
cd your-project-dir
mason claude
```

You can also run projects with other agents using the claude config
```bash
mason pi --source claude
```


### 2. Define project roles

The mason project uses roles to strictly define what an agent can doe.

When masons is run without the "--role" argument, it builds a in memory role that
has all of the "source" skills, mcp-servers, etc, and the container is configured
too allow all of those operations.


#### Use the configure command

Have your agent [**configure**](docs/role-configure-project.md) your project's roles with mason.

```bash
cd ~/your-project
mason configure --agent claude
```

### 3. Run your agents with a role

```bash
mason claude --role {project-role}
```

*Follow the instructions generated in `.mason/initial-role-plan.md` to test the roles.*


## Our Dream, in a Simplified Example

Joe is a DevOps engineer running a project. He has admin-level AWS, GitHub, and Jira credentials on his laptop. He also has skills loaded up in `.claude` ready to use all those credentials as needed for his workflow.

This is a powder keg waiting for either a prompt injection attack or an agent to accidentally run the wrong skill at the wrong time.

Joe installs and runs `mason configure` to get roles that look like:
```
Devops
 - skills: terraform, ship-it
 - tools: aws

Lead
 - skills: review-pr, merge-pr, create-story, create-bug
 - tools: github-pr-merge

Developer
 - skills: openspec, implement-story, fix-bug
 - tools: github-pr-create
```

Joe runs Claude and interacts with it like it was running on his host computer. If he needs to write code:
```bash
mason claude --role developer
```

This locks the agent into a [**secure Docker container**](docs/security.md), with only access to that role's skills, tools, and the project directory. Furthermore, MCP servers for the tools (and the credentials necessary to run them) are executed in an [**MCP proxy**](docs/component-mcp-proxy.md) sidecar container. No risk of an overly helpful agent or prompt injection attack deleting AWS resources.

The container environment provides both [**security**](docs/security.md) and allows the agent to [**focus**](docs/benefits.md#focus) on their current role.

That's the dream, and the goal for our developer experience.


## Command Reference

| Command | Description |
|---------|-------------|
| `mason run <agent> --role <name>` | Run a role on the specified agent runtime |
| `mason <agent> --role <name>` | Shorthand for `run` |
| `mason run <agent> --role <name> --acp` | Run as an ACP agent which proxies to the agent in the container |
| `mason run <agent> --role <name> --dev-container` | Run project in a dev container with the agent enabled within VS Code |

## Documentation

| Doc | Description |
|-----|-------------|
| [Overview](docs/overview.md) | What Mason is and why it matters |
| [Getting Started](docs/get-started.md) | Install and run your first role |
| [Core Concepts](docs/concepts.md) | Roles, tasks, skills, apps, and how they compose |
| [Architecture](docs/architecture.md) | Runtime architecture with sequence diagrams |
| [CLI Reference](docs/cli.md) | Complete command reference |
| [Security Model](docs/security.md) | Credentials, permissions, audit logging |
| [MCP Proxy](docs/component-mcp-proxy.md) | Tool filtering and routing |
| [Credential Service](docs/component-credential-service.md) | Secure credential resolution |



## Contributing

See [Development](docs/development.md) for build instructions, project structure, and the programmatic API.

## License

MIT
