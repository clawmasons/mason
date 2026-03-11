## Design: Session Module -- Remove port exposure, add startAgentProcess()

### Overview

This change modifies `AcpSession` to remove all port-related configuration and compose output, and adds a new `startAgentProcess()` method that spawns `docker compose run` as a foreground child process with piped stdio.

### Key Decisions

**1. `startAgentProcess()` uses `child_process.spawn()` directly, not `execComposeCommand`**

`execComposeCommand` returns only an exit code and cannot provide access to the child process handle or its stdio streams. The new method needs to return a `ChildProcess` so the bridge can wrap its stdin/stdout with `ndJsonStream()`. Therefore, `startAgentProcess()` spawns the compose command directly using `child_process.spawn()`.

**2. No `-d` flag -- foreground process**

The child process runs in the foreground with piped stdio. This means `docker compose run` blocks until the container exits. The child process IS the transport -- its stdin/stdout carry ndjson protocol messages.

**3. `stopAgent()` kills the child process**

When a child process exists (from `startAgentProcess()`), `stopAgent()` kills it via `child.kill()`. This causes `docker compose run` to exit, which stops the container. The existing compose stop/rm calls remain for the legacy `startAgent()` path.

**4. Removing `acpPort` from types**

`acpPort` is removed from `AcpSessionConfig`, `SessionInfo`, `AgentSessionInfo`, and `generateAcpComposeYml()` opts. No port is needed because communication is over piped stdio.

### Interface Changes

```typescript
// New method on AcpSession
startAgentProcess(projectDir: string): { child: ChildProcess, agentInfo: AgentSessionInfo }

// Removed from AcpSessionConfig
acpPort?: number;  // REMOVED

// Removed from SessionInfo
acpPort: number;   // REMOVED

// Removed from AgentSessionInfo
acpPort: number;   // REMOVED

// Removed from generateAcpComposeYml opts
acpPort: number;   // REMOVED
```

### Compose Output Change

Before:
```yaml
  agent-note-taker-writer:
    ...
    ports:
      - "3002:3002"
```

After:
```yaml
  agent-note-taker-writer:
    ...
    # No ports section
```

### New Dependency on AcpSessionDeps

A new optional `spawnFn` is added to `AcpSessionDeps` so tests can mock `child_process.spawn()`:

```typescript
export interface AcpSessionDeps {
  // ... existing
  spawnFn?: (command: string, args: string[], options: SpawnOptions) => ChildProcess;
}
```

### Error Handling

- `startAgentProcess()` throws if infrastructure is not running
- `startAgentProcess()` throws if an agent is already running
- The child process `error` event is not handled here -- the caller (bridge) is responsible for child process lifecycle
