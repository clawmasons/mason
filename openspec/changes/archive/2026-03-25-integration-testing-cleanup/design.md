## Design: Integration Testing + Cleanup

### Architecture

The integration test uses the same in-memory `TransformStream` pattern as existing unit tests but exercises the full ACP protocol lifecycle in a single sequential test suite. Instead of testing individual handlers in isolation, it verifies they compose correctly when called through the SDK's `ClientSideConnection` → `AgentSideConnection` pipeline.

### Test Structure

A single `describe("ACP protocol lifecycle integration")` block with an ordered sequence of tests that share state (sessionId, connection) across the suite. The `beforeAll` sets up connections and mocks; individual tests execute protocol methods in lifecycle order.

#### Connection Setup

```typescript
// Same pattern as existing tests:
const clientToAgent = new TransformStream<Uint8Array>();
const agentToClient = new TransformStream<Uint8Array>();
const agentStream = ndJsonStream(agentToClient.writable, clientToAgent.readable);
const agentConn = new AgentSideConnection((conn) => createMasonAcpAgent(conn), agentStream);
const clientStream = ndJsonStream(clientToAgent.writable, agentToClient.readable);
const clientConn = new ClientSideConnection(/* sessionUpdate collector */, clientStream);
```

#### Mocking Strategy

- **Discovery cache** (`discoverForCwd`): Mocked to return a fake role with tasks + fake agent list. Same approach as existing tests.
- **Prompt executor** (`executePrompt`): Mocked to return canned output. For cancel test, mocked to be slow and check abort signal.
- **resolveRole**: Mocked for setConfigOption role-change scenario.
- **No real filesystem scans or subprocess spawning.**

#### Test Scenarios (in order)

1. **`initialize`** -- Send `initialize` with `protocolVersion: PROTOCOL_VERSION`. Verify response has correct `protocolVersion`, `agentCapabilities` (loadSession, promptCapabilities, sessionCapabilities), and `agentInfo` (name: "mason", version matches CLI package.json).

2. **`session/new`** -- Send `newSession({ cwd: tempDir })`. Verify response has a valid UUID v7 `sessionId` and `configOptions` array with role and agent selects. Verify `available_commands_update` notification arrives with the default role's tasks.

3. **`session/prompt`** -- Send `prompt({ sessionId, prompt: [{ type: "text", text: "hello" }] })`. Verify response has `stopReason: "end_turn"`. Verify `agent_message_chunk` notification with the mocked output. Verify `session_info_update` notification with title and updatedAt.

4. **`session/list`** -- Send `listSessions({ cwd: tempDir })`. Verify the created session appears in the list with correct `sessionId`, `cwd`, `title` (from firstPrompt), and `updatedAt`.

5. **`session/close`** -- Send `unstable_closeSession({ sessionId })`. Verify subsequent `listSessions` returns empty. Verify `meta.json` has `closed: true`.

6. **`session/load`** -- Create a second session, close the first, then `loadSession` the second. Verify in-memory state is restored and `configOptions` are returned.

7. **`session/set_config_option`** -- Send `setSessionConfigOption({ sessionId, configId: "role", value: "ops" })`. Verify `available_commands_update` notification with new role's tasks. Verify response has complete `configOptions` with updated currentValue.

8. **`session/cancel`** -- Start a slow prompt (mocked), send `cancel({ sessionId })`, verify prompt resolves with `stopReason: "cancelled"`.

### Cleanup: Remove `"acp"` from VALID_MODES

In `packages/agent-sdk/src/discovery.ts`:

1. **Line 118:** Change `VALID_MODES` from `["terminal", "acp", "bash"]` to `["terminal", "bash"]`.
2. **Line 64:** Change type `"terminal" | "acp" | "bash"` to `"terminal" | "bash"` in `AgentEntryConfig.mode`.
3. **Line 96:** Change type `"terminal" | "acp" | "bash"` to `"terminal" | "bash"` in `AliasEntryConfig.mode`.
4. **Line 154:** Update cast to `"terminal" | "bash"`.
5. **Line 157:** Update warning message to say `"expected terminal or bash"`.
6. **Line 659:** Update cast to `"terminal" | "bash"`.
7. **Line 662:** Update warning message to say `"expected terminal or bash"`.

### Test Coverage

| Scenario | REQs Verified |
|----------|--------------|
| initialize | REQ-001, REQ-002, REQ-004 |
| session/new | REQ-003, REQ-005, REQ-012 |
| session/prompt | REQ-006 |
| session/list | REQ-008 |
| session/close | REQ-010 |
| session/load | REQ-007 |
| set_config_option | REQ-011, REQ-012 |
| cancel | REQ-009 |

All P0 REQs are covered. REQ-013 (remove old ACP code) was verified in Change 1.
