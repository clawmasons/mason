---
title: Security Model
description: How clawmasons secures agent execution and credential management
---

# Security Model

Clawmasons is built around the principle that AI agents should operate under explicit governance — with controlled tool access, isolated credentials, and full audit trails.

## Credential Isolation

**Problem**: Most agent frameworks pass credentials via environment variables, which are visible through `docker inspect`, `/proc/*/environ`, and shell history.

**Solution**: Clawmasons resolves credentials on-demand through the [credential service](component-credential-service.md):

- Credentials are **never stored** in Docker environment variables or compose files
- The agent-entry bootstrap requests credentials through the MCP proxy at startup
- Values are injected **only into the agent's child process memory**
- `docker inspect` and `/proc/1/environ` reveal nothing

### Resolution Sources

Credentials are resolved in priority order:

1. **Session overrides** — ACP editor configuration
2. **Environment variables** — Credential service process env
3. **macOS Keychain** — System keychain lookup
4. **`.env` file** — Project-level dotenv

## Role-Based Access Control

Every agent runs under a [role](chapter-role.md) that defines explicit tool permissions:

```json
{
  "permissions": {
    "@acme/app-github": {
      "allow": ["create_pr", "list_issues"],
      "deny": ["delete_repo"]
    }
  }
}
```

- **Allow lists** — Only listed tools are exposed
- **Deny lists** — Override allow (deny wins)
- **Unlisted apps** — Completely hidden from the agent
- **Enforced at runtime** — The [MCP proxy](component-mcp-proxy.md) filters tools before the agent sees them

### Risk Levels

Roles declare a risk level (`LOW`, `MEDIUM`, `HIGH`) that affects:
- Maximum concurrent session limits
- Approval workflow triggers
- Audit verbosity

### Approval Workflows

Roles can require human approval for sensitive operations:

```json
{
  "constraints": {
    "requireApprovalFor": ["delete_*", "push_*"]
  }
}
```

Tool calls matching these patterns pause for human confirmation before execution.

## Container Isolation

Agents run in Docker containers with:
- **Isolated filesystem** — Workspace mounted at `/workspace`
- **No host network access** — Container networking only
- **Explicit mounts** — Only directories declared in the role's `mounts` are accessible
- **Custom base images** — Roles can specify `baseImage` and `aptPackages`

## Audit Logging

All operations are logged to a SQLite database (`chapter.db`):

### Tool Call Audit
- Tool name, arguments, and result
- Duration and status (success/error)
- Timestamp and agent/role context
- Pre-call and post-call hooks

### Credential Access Audit
- Credential key requested
- Outcome: `granted`, `denied`, or `error`
- Resolution source (env, keychain, dotenv)
- Denial reason (if applicable)
- Timestamp and agent context

## Token Authentication

The system uses two authentication tokens:

| Token | Purpose | Scope |
|-------|---------|-------|
| `MCP_PROXY_TOKEN` | Agent-to-proxy authentication | Authenticates the agent container to the proxy |
| Session token | Credential request authentication | Returned by `/connect-agent`, required for credential requests |

Tokens are generated per session and not reused.

## Related

- [Credential Service](component-credential-service.md) — How credentials are resolved
- [MCP Proxy](component-mcp-proxy.md) — Runtime enforcement of permissions
- [Role](chapter-role.md) — Defining permissions and risk levels
- [Architecture](architecture.mdx) — Full runtime architecture
