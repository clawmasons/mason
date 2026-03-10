# Design: `chapter acp-proxy` CLI Command

**Date:** 2026-03-10

## Approach

The `acp-proxy` command is an orchestrator that ties together all previously-built ACP modules. It follows the same patterns as the existing `proxy` and `run-agent` commands but with ACP-specific lifecycle management.

### Architecture

```
chapter acp-proxy --agent myagent --role myrole --port 3001
  |
  +-- 1. discoverPackages() / resolveAgent()
  +-- 2. computeToolFilters()
  +-- 3. AcpBridge.start() on --port (default 3001)
  +-- 4. Log "ready -- waiting for ACP client"
  |
  |  <-- ACP client connects -->
  |
  +-- 5. matchServers(mcpServers, apps)
  +-- 6. rewriteMcpConfig() + extractCredentials()
  +-- 7. generateWarnings() -> log to stderr
  +-- 8. AcpSession.start() (Docker containers)
  +-- 9. AcpBridge.connectToAgent() (bridge to container)
  +-- 10. Log matched/dropped summary
  |
  |  <-- ACP client disconnects -->
  |
  +-- 11. AcpBridge.stop() -> AcpSession.stop()
  +-- 12. Graceful shutdown
```

### CLI Options

| Option | Default | Description |
|--------|---------|-------------|
| `--agent <name>` | auto-detect | Agent package name |
| `--role <name>` | required | Role to use for the session |
| `--port <number>` | 3001 | ACP endpoint port (host-side) |
| `--proxy-port <number>` | 3000 | Internal chapter proxy port |

### Key Design Decisions

1. **Reuse existing modules** -- The command is pure orchestration. All logic lives in matcher, rewriter, session, and bridge modules. The command just wires them together.

2. **Dependency injection for testing** -- Like `runAgent`, the `acpProxy` function accepts an injectable `AcpProxyDeps` interface for mocking session, bridge, package discovery, and agent resolution in unit tests.

3. **Event-driven lifecycle** -- The bridge's `onClientConnect` and `onClientDisconnect` callbacks drive the Docker session lifecycle. No polling.

4. **Graceful shutdown** -- SIGINT/SIGTERM stop the bridge and session cleanly, following the same pattern as the existing proxy command.

5. **Agent auto-detection** -- Reuses the same `resolveAgentName` helper pattern from `proxy.ts` (look at discovered packages, use the single agent or error if multiple).

### Function Signatures

```typescript
interface AcpProxyOptions {
  agent?: string;
  role: string;
  port?: number;
  proxyPort?: number;
}

interface AcpProxyDeps {
  discoverPackagesFn?: (rootDir: string) => Map<string, DiscoveredPackage>;
  resolveAgentFn?: (name: string, packages: Map<string, DiscoveredPackage>) => ResolvedAgent;
  createSessionFn?: (config: AcpSessionConfig, deps?: AcpSessionDeps) => AcpSession;
  createBridgeFn?: (config: AcpBridgeConfig) => AcpBridge;
}

function registerAcpProxyCommand(program: Command): void;

async function acpProxy(
  rootDir: string,
  options: AcpProxyOptions,
  deps?: AcpProxyDeps,
): Promise<void>;
```

### Error Handling

| Error | Behavior |
|-------|----------|
| No agent found | Exit 1 with descriptive error |
| Multiple agents, no --agent | Exit 1 listing available agents |
| Docker compose unavailable | Exit 1 with install instructions |
| Session start failure | Exit 1, tear down partial state |
| Bridge connection failure | Exit 1, stop session |
| SIGINT/SIGTERM | Graceful shutdown: stop bridge, stop session |

### Backward Compatibility

This is a new command with no existing API to maintain. It coexists with the existing `chapter proxy` and `chapter run-agent` commands.
