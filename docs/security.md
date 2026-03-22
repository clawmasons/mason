---
title: Security Model
description: How Mason secures agent execution and credential management
---

# Security Model

Mason is built around the principle that AI agents should operate under explicit governance — with controlled tool access, isolated credentials, and full audit trails.

## Credential Isolation

**Problem**: Most agent frameworks pass credentials via environment variables, which are visible through `docker inspect`, `/proc/*/environ`, and shell history.

**Solution**: Mason resolves credentials on-demand through the [host proxy](proxy.md):

- Credentials are **never stored** in Docker environment variables or compose files
- The agent-entry bootstrap requests credentials through the MCP proxy at startup
- Values are injected **only into the agent's child process memory**
- `docker inspect` and `/proc/1/environ` reveal nothing

### Resolution Sources

Credentials are resolved in priority order:

1. **Session overrides** — ACP editor configuration
2. **Environment variables** — Host process env
3. **macOS Keychain** — System keychain lookup
4. **`.env` file** — Project-level dotenv

## Role-Based Access Control

Every agent runs under a [role](role.md) that defines explicit tool permissions:

```yaml
mcp_servers:
  - name: github
    tools:
      allow: [create_pr, list_issues]
      deny: [delete_repo]
```

- **Allow lists** — Only listed tools are exposed
- **Deny lists** — Override allow (deny wins)
- **Unlisted apps** — Completely hidden from the agent
- **Enforced at runtime** — The [proxy](proxy.md) filters tools before the agent sees them

### Risk Levels

Roles declare a risk level (`LOW`, `MEDIUM`, `HIGH`) that affects:
- Maximum concurrent session limits
- Approval workflow triggers
- Audit verbosity

### Approval Workflows

Roles can require human approval for sensitive operations:

```yaml
constraints:
  requireApprovalFor:
    - "github_delete_*"
    - "*_write_file"
```

Tool calls matching these patterns trigger a native macOS dialog (via `osascript`) where the operator can approve or deny the action. The request includes the tool name and arguments. If the operator doesn't respond within the TTL (default 300s), the call is auto-denied. On non-macOS platforms, calls are auto-approved with a warning log.

## Container Isolation

Agents run in Docker containers with:
- **Isolated filesystem** — Workspace mounted at `/workspace`
- **No host network access** — Container networking only
- **Explicit mounts** — Only directories declared in the role's `mounts` are accessible
- **Custom base images** — Roles can specify `baseImage` and `aptPackages`

## Audit Logging

All operations are logged to `~/.mason/data/audit.jsonl` as JSON lines on the host machine. Audit events are sent from the Docker proxy to the host proxy via relay messages (fire-and-forget).

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

The system uses three authentication tokens:

| Token | Purpose | Scope |
|-------|---------|-------|
| `MCP_PROXY_TOKEN` | Agent-to-proxy authentication | Agent container → Docker proxy |
| `RELAY_TOKEN` | Host-to-proxy relay authentication | Host proxy → Docker proxy WebSocket |
| Session token | Credential request authentication | Returned by `/connect-agent`, required for credential requests |

Tokens are generated per session and not reused.

## Related

- [Proxy](proxy.md) — How credentials are resolved and tools are filtered
- [Role](role.md) — Defining permissions and risk levels
- [Architecture](architecture.md) — Full runtime architecture
