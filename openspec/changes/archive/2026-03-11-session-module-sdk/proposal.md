## Why

The `AcpSession` class currently exposes the agent container's ACP port (3002) to the host via Docker Compose `ports` mapping and uses `--service-ports` with `docker compose run -d`. This creates port collision risks when running multiple agents, adds unnecessary network complexity, and couples the session module to a detached-container + HTTP approach.

The ACP SDK migration (PRD `acp-sdk`) replaces HTTP communication with direct stdio piping. The session module needs a new `startAgentProcess()` method that spawns `docker compose run` (no `-d`) as a child process with piped stdin/stdout/stderr. This gives the bridge a direct transport stream -- no port mapping, no container ID discovery.

## What Changes

- `packages/cli/src/acp/session.ts`:
  - Remove `ports: "${acpPort}:${acpPort}"` from `generateAcpComposeYml()` output
  - Remove `acpPort` parameter from `generateAcpComposeYml()` opts
  - Remove `acpPort` from `AcpSessionConfig`, `SessionInfo`, `AgentSessionInfo`
  - Remove `--service-ports` from `startAgent()` run args
  - Add `startAgentProcess(projectDir)` method that spawns `docker compose run --rm --build -v ${cwd}:/workspace <service>` with `stdio: ['pipe', 'pipe', 'pipe']` (no `-d`). Returns `{ child: ChildProcess, agentInfo: AgentSessionInfo }`
  - Update `stopAgent()` to kill the child process if one exists
- `packages/cli/tests/acp/session.test.ts`:
  - Update tests verifying port exposure to verify NO ports section
  - Add tests for `startAgentProcess()` returning a child process handle
  - Update `startAgent()` tests to verify no `--service-ports` flag

## Capabilities

### New Capabilities
- `start-agent-process`: New `startAgentProcess(projectDir)` method on `AcpSession` that spawns `docker compose run` as a foreground child process with piped stdio, returning the `ChildProcess` handle for wrapping with `ndJsonStream()`

### Modified Capabilities
- `acp-session`: Port exposure removed from compose generation; `startAgent()` no longer uses `--service-ports`; `stopAgent()` kills child process if present

### Removed Capabilities
- `acp-port-exposure`: Docker port mapping for the agent ACP port is removed entirely

## Impact

- **Modified file:** `packages/cli/src/acp/session.ts` -- compose generation, new method, cleanup
- **Modified file:** `packages/cli/tests/acp/session.test.ts` -- updated and new tests
