# Design: Docker Session Orchestration for ACP

**Date:** 2026-03-10

## Approach

The AcpSession adapts the existing `run-agent.ts` three-container Docker Compose pattern for programmatic use in ACP mode. Instead of an interactive CLI flow, it provides a class with start/stop lifecycle methods.

### Architecture

```
AcpSession.start()
    |
    v
Generate docker-compose.yml
  - proxy service: `chapter proxy --agent <name>` with matched apps
  - credential-service: with CREDENTIAL_SESSION_OVERRIDES env var
  - agent service: ACP mode entrypoint, exposes ACP port
    |
    v
docker compose up -d (all services)
    |
    v
Return SessionInfo { sessionId, sessionDir, composeFile, acpPort }
```

### Key Design Decisions

1. **Non-Interactive Start** -- Unlike `run-agent.ts` which starts the agent interactively with `stdin_open: true`, ACP sessions start all three services detached. The agent container runs its ACP agent command and listens for connections from the bridge.

2. **ACP Entrypoint** -- The agent service uses the ACP runtime command instead of the default runtime. This is derived from the agent's primary runtime and `ACP_RUNTIME_COMMANDS`.

3. **Credential Session Overrides** -- The credential-service container receives `CREDENTIAL_SESSION_OVERRIDES` as a JSON-encoded environment variable containing credentials extracted from the ACP client's mcpServers env fields. The credential-service CLI already supports parsing this env var (from CHANGE 4).

4. **ACP Port Exposure** -- The agent container exposes its ACP port (default 3002, configurable via `agent.acp.port`) to the host, so the AcpBridge (from CHANGE 7) can connect to it.

5. **Session Directory** -- Session artifacts (compose file, logs) are stored in `.clawmasons/sessions/{sessionId}/docker/`, following the existing `run-agent.ts` convention.

6. **Dependency Injection** -- Like `run-agent.ts`, the session accepts injectable dependencies (`AcpSessionDeps`) for compose execution, session ID generation, and Docker checks, enabling unit testing without Docker.

### Class API

```typescript
interface AcpSessionConfig {
  projectDir: string;         // Workspace root
  agent: string;              // Agent short name
  role: string;               // Role short name
  acpPort?: number;           // ACP agent port in container (default 3002)
  proxyPort?: number;         // Internal proxy port (default 3000)
  credentials?: Record<string, string>;  // Session credential overrides
}

interface SessionInfo {
  sessionId: string;
  sessionDir: string;
  composeFile: string;
  acpPort: number;
  proxyServiceName: string;
  agentServiceName: string;
}

interface AcpSessionDeps {
  execComposeFn?: (file: string, args: string[], opts?: { interactive?: boolean }) => Promise<number>;
  generateSessionIdFn?: () => string;
  checkDockerComposeFn?: () => void;
}

class AcpSession {
  constructor(config: AcpSessionConfig, deps?: AcpSessionDeps);
  start(): Promise<SessionInfo>;
  stop(): Promise<void>;
  isRunning(): boolean;
}
```

### Generated docker-compose.yml Structure

```yaml
services:
  proxy-<role>:
    build:
      context: "<docker-build-path>"
      dockerfile: "proxy/<role>/Dockerfile"
    volumes:
      - "<projectDir>:/workspace"
      - "<logsDir>:/logs"
    environment:
      - CHAPTER_PROXY_TOKEN=<token>
      - CREDENTIAL_PROXY_TOKEN=<token>
    restart: "no"

  credential-service:
    build:
      context: "<docker-build-path>"
      dockerfile: "credential-service/Dockerfile"
    environment:
      - CREDENTIAL_PROXY_TOKEN=<token>
      - CREDENTIAL_SESSION_OVERRIDES=<json>  # ACP-specific
    depends_on:
      - proxy-<role>
    restart: "no"

  agent-<agent>-<role>:
    build:
      context: "<docker-build-path>"
      dockerfile: "agent/<agent>/<role>/Dockerfile"
    volumes:
      - "<projectDir>:/workspace"
    depends_on:
      - credential-service
    environment:
      - MCP_PROXY_TOKEN=<token>
    ports:
      - "<acpPort>:<acpPort>"    # ACP-specific: expose ACP agent port
    restart: "no"
    init: true
    # Note: no stdin_open/tty in ACP mode (non-interactive)
```

### Differences from run-agent.ts

| Aspect | run-agent.ts | AcpSession |
|--------|-------------|------------|
| Agent container | Interactive (stdin_open, tty) | Detached (no stdin/tty) |
| Agent entrypoint | Default runtime command | ACP runtime command |
| Credential overrides | None | CREDENTIAL_SESSION_OVERRIDES env var |
| Port exposure | None | ACP port exposed to host |
| Lifecycle | Start interactive, teardown on exit | Start/stop programmatic |
| Container start | Sequential (proxy, cred, then agent interactive) | All detached (`docker compose up -d`) |

### Error Handling

| Error | Behavior |
|-------|----------|
| Missing Dockerfiles | Throws with descriptive error (reuses `validateDockerfiles`) |
| Docker compose not available | Throws (reuses `checkDockerCompose`) |
| Compose up fails | Throws with exit code |
| Stop called when not running | No-op (idempotent) |
| Double start | Throws "session already running" |

### Backward Compatibility

This is a new module. The existing `run-agent.ts` is not modified. Both share the same utility functions from `run-agent.ts` (token generation, compose execution, etc.).
