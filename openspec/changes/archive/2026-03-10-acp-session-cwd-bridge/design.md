# Design: ACP Session CWD Support -- Bridge Intercepts `session/new`

## Overview

This change transforms `run-acp-agent` from eagerly starting all Docker containers at launch to a deferred model where:

1. Proxy + credential-service start at launch (long-lived infrastructure)
2. Agent container starts lazily when `session/new` arrives (per-session)
3. The bridge intercepts `session/new` to extract `cwd` and launch the agent with the correct workspace mount
4. On disconnect, only the agent container stops; proxy + credential-service stay running

## Architecture Changes

### AcpBridge Changes (`packages/cli/src/acp/bridge.ts`)

Add a new callback `onSessionNew` that is invoked when the bridge detects a `session/new` request with a `cwd` field. The bridge:

1. Buffers POST request bodies
2. Checks if the request path matches the `session/new` pattern (POST to `/`)
3. Parses the JSON-RPC body to detect `method: "initialize"` or similar session initiation (ACP uses JSON-RPC; the `session/new` is a POST with an `initialize` method or the path itself is the signal)
4. Extracts the `cwd` from `params` if present
5. Calls `onSessionNew(cwd)` callback which returns a Promise -- the bridge waits for it before relaying

Key design decision: The bridge treats the **first POST request** as the session initiation signal. It buffers the body, calls `onSessionNew`, waits for the agent to be ready, then replays the buffered request to the agent.

New interface additions:
```typescript
/** Invoked when a session/new-like request arrives. Returns resolved when agent is ready. */
onSessionNew?: (cwd: string) => Promise<void>;
```

The bridge changes from requiring `connectToAgent()` before accepting requests to accepting requests immediately -- but holding them until the agent is connected after `onSessionNew` completes.

### AcpSession Changes (`packages/cli/src/acp/session.ts`)

Split into two-phase startup:

1. `startInfrastructure()` -- starts proxy + credential-service (detached). Returns session info without agent.
2. `startAgent(projectDir: string)` -- starts agent container with `projectDir` mounted as `/workspace`. Generates a new compose file for the agent only.
3. `stopAgent()` -- stops just the agent container (not proxy/credential-service).
4. `stop()` -- stops everything (used on full shutdown).

New compose generation: `generateInfraComposeYml()` for proxy + credential-service only, and `generateAgentComposeYml()` for the agent container only (separate compose files so they can be managed independently).

### run-acp-agent Changes (`packages/cli/src/cli/commands/run-acp-agent.ts`)

The orchestrator changes from:
1. Start bridge -> Start full session -> Connect bridge to agent

To:
1. Start infrastructure (proxy + cred-svc) via AcpSession
2. Start bridge
3. Wire `bridge.onSessionNew` callback that:
   a. Extracts `cwd` from the session request
   b. Creates `.clawmasons/` in `cwd`
   c. Ensures `.gitignore` in `cwd`
   d. Calls `session.startAgent(cwd)` to launch agent container
   e. Calls `bridge.connectToAgent()` to verify agent is reachable
4. Wire `bridge.onClientDisconnect` to call `session.stopAgent()` (not full stop)
5. Process stays alive; next `session/new` starts a new agent

### Session Lifecycle

```
run-acp-agent startup:
  1. Auto-init role (existing)
  2. Start proxy + credential-service (new: infrastructure only)
  3. Start bridge HTTP server (existing, but no agent yet)
  4. Ready -- waiting for session/new

session/new arrives (POST with cwd):
  1. Bridge buffers request body
  2. Bridge calls onSessionNew(cwd)
  3. run-acp-agent creates .clawmasons/ in cwd
  4. run-acp-agent calls session.startAgent(cwd)
  5. run-acp-agent calls bridge.connectToAgent()
  6. Bridge replays buffered request to agent
  7. All subsequent requests relayed normally

Client disconnects (idle timeout):
  1. Bridge calls onClientDisconnect
  2. run-acp-agent calls session.stopAgent()
  3. Bridge resets to waiting state
  4. Next session/new starts fresh agent
```

## File Changes

### 1. `packages/cli/src/acp/bridge.ts`
- Add `onSessionNew?: (cwd: string) => Promise<void>` callback
- Buffer first POST body, parse for `cwd`, call `onSessionNew`
- After `onSessionNew` resolves, relay buffered request
- Reset `agentConnected` and `clientSeen` on disconnect for reuse
- Add `resetForNewSession()` method to support multi-session lifecycle

### 2. `packages/cli/src/acp/session.ts`
- Add `startInfrastructure()` method -- starts proxy + credential-service
- Add `startAgent(projectDir: string)` method -- starts agent with workspace mount
- Add `stopAgent()` method -- stops only the agent container
- Generate separate compose files for infrastructure vs agent
- Keep `start()` for backward compatibility (calls both)
- Keep `stop()` to tear down everything

### 3. `packages/cli/src/cli/commands/run-acp-agent.ts`
- Change startup flow: start infrastructure first, then bridge
- Wire `onSessionNew` to handle CWD extraction + agent launch
- Wire `onClientDisconnect` to stop agent only (not exit process)
- Support multiple sequential sessions without restarting

### 4. Tests
- `packages/cli/tests/acp/bridge.test.ts` -- add tests for `onSessionNew` callback, body buffering, multi-session
- `packages/cli/tests/acp/session.test.ts` -- add tests for split lifecycle (startInfrastructure, startAgent, stopAgent)
- `packages/cli/tests/cli/run-acp-agent.test.ts` -- update to reflect new flow (no immediate session start, CWD handling)

## Acceptance Criteria

1. Proxy + credential-service start at `run-acp-agent` launch
2. Agent container NOT started until `session/new` arrives
3. `session/new` with `cwd` mounts that directory as `/workspace`
4. `session/new` without `cwd` uses `process.cwd()`
5. `.clawmasons/` created in `cwd` directory
6. `.gitignore` updated in `cwd` directory
7. On disconnect, only agent container stops
8. Subsequent `session/new` starts new agent container
9. Proxy + credential-service remain running across sessions
