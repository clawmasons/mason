# Mason

Mason runs your agents in secure docker contianers scoped to what they need with [**Roles**](/docs/role.md)

## Prerequisites

```mason``` is a typescript command line that runs your agent in containers.  Hence three prerequisites:

- [**Docker**](docker.md)
- [**Node Environment**](node.md) 
- [**Supported Agent**](docs/agents.md)


## Quick start

### 1. Install mason globally
```bash
npm install -g @clawmasons/mason
```

### 2. Define your roles

Have your agent [**configure**](docs/mason-configure.md) your project's roles with mason. 

```bash
cd ~/your-project
mason configure --agent claude
```

###.3. Run your agents with a role

```basH
mason claude --role {project-role}
```

*Follow instructions generated in ```.mason/inital-role.plan.md``` to test the roles*


## Our dream, in a simplified example

Joe Devops is running a project and has admin level AWS, github and jira credentials
on your laptop today.  Furthermore, joey has skills loaded up in .claude ready to use all those 
credentials as needed for his workflow.

This is a powder keg waiting for either a prompt injection attack or an agent to accidetally 
run the worng skill at the wrong time.


Joe installs and run's ```mason configure```, to get roles that look like:
```
** Devops **
 -skills: terraform, ship-it
 -tools: aws

** Lead **
 - skills: review-pr, merge-pr, create-story, create-bug
 - tools: github-pr-merge
  
** Developer **
 - skills: openspec, implement-story, fix-bug,
 - tools: github-pr-create
```

Joe runs claude and interacts with it like it was running on his host computer.  If he needs to write code:
```
 mason claude --role developer
```

Which locks the agent into a [**secure docker container**](docs/docker.md), with only access to that role's skills, tools and the project directory.  Futhermore, mcp-server's for the tools (and the credentials ncessary to run them) are executed in a [**mcp proxy**](docs/component-mcp-proxy.md) sidecar container.  No risk of an overly helpful agent or prompt-injection attack deleting AWS.

The container environment provides both [**security**](docs/security.md) and allows the agent to [**focus**](docs/benefits.md#focus) on their current role.

That's the dream, and the goal for our developer experience


### Command Reference

| Command | Description |
|---------|-------------|
| `mason run <agent> --role <name>` | Run a role on the specified agent runtime |
| `mason <agent> --role <name>` | Shorthand for `run` |
| `mason run <agent> --role <name> --acp` | Run as an ACP agent which proxies to the agent in the container |
| `mason run <agent> --role <name> --dev-container` | Run project in a dev container with Agent enabled within VScode |

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

See [DEVELOPMENT.md](DEVELOPMENT.md) for build instructions, project structure, and the programmatic API.

## License

MIT
