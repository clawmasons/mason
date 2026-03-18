


# Role Based Agent Containers.  that's an interesting acronym :) 

RBAC is a well known concept for user crecential management and the project founder
has extensive experience in the field.  This project applies many of the concepts
to agent frameworks and their container runtime environment.

# Privlidged Credential Managment


# Credential refreshes

Since credentials are not accessed by the agent, long term tokens can be shared with the [mcp-proxy](mcp-proxy.doc) which it can either use, or automatically refresh short term credentials needed by MCP tools.  Neither the 

Example: Jira


# Focus

Too many tools, too many skills can cause the agent to be confused.

We don't wan't our "Test Developer" changing code to get the tests to pass.  But
90% of most projects skills and agent tips are on how to write code.  As a result,
prior to deploying ```mason`` we saw our agents reveting to those instructuions and
changing code to make tests pass.  

```mason``` allowed us to finally control our test case development workflow

subagents help here, but agents can be crafty.

# 