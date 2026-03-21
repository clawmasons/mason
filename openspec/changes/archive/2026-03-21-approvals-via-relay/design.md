## Context

The relay protocol (Changes 1-3) established `approval_request` and `approval_response` message types. Change 6 updated the Docker-side approval hook to use `relay.request()` to send `approval_request` and await `approval_response`. The host side has no handler — this change implements it.

The pattern follows `CredentialRelayHandler` (from Change 5): a handler class registers on a `RelayClient`, receives typed messages, performs host-side logic, and sends a response with the same `id` for correlation.

## Goals / Non-Goals

**Goals:**
- `showApprovalDialog()` shows a native macOS dialog with tool name, arguments, and agent name
- `ApprovalHandler` registers for `approval_request` on `RelayClient`, invokes dialog, sends `approval_response`
- Non-macOS platforms auto-approve with console warning
- User input is safely escaped to prevent osascript command injection
- TTL timeout auto-denies
- Full test coverage for dialog and handler

**Non-Goals:**
- Host proxy orchestrator wiring (Change 8)
- Web UI or terminal-based approval alternatives
- Windows/Linux native dialogs

## Decisions

### D1: osascript escaping strategy

**Choice:** Replace all backslashes and double-quotes in user-provided strings before embedding them in osascript commands. Use a dedicated `escapeForOsascript()` helper.

**Rationale:** Tool names and JSON arguments are user-controlled data embedded into an `osascript -e` command string. Without escaping, a tool name like `foo"$(rm -rf /)` could break out of the AppleScript string literal. We escape `\` → `\\` and `"` → `\"` which is sufficient for AppleScript double-quoted strings.

### D2: Non-macOS fallback is auto-approve with warning

**Choice:** On non-macOS platforms, `showApprovalDialog()` returns `true` (approved) and logs a warning.

**Rationale:** The PRD (REQ-007) specifies "Non-macOS → auto-approve with a console log warning." This matches the decision from Q2 in the PRD's open questions section.

### D3: ApprovalHandler follows CredentialRelayHandler pattern

**Choice:** Same class structure: constructor takes `RelayClient`, `register()` method registers handler, private async method handles the message.

**Rationale:** Consistency with existing codebase patterns. The `CredentialRelayHandler` is the established pattern for host-side relay handlers.

### D4: TTL enforcement on the handler side

**Choice:** The `ApprovalHandler` sets a timeout based on the `ttl_seconds` from the incoming `approval_request`. If the dialog hasn't been answered by then, it sends `status: "denied"`.

**Rationale:** The Docker side also has a timeout on `relay.request()`, but the handler-side timeout ensures a clean `approval_response` is sent rather than letting the relay request silently expire. This gives the Docker proxy a definitive "denied" rather than a timeout error.

## Module Changes

### `packages/proxy/src/approvals/dialog.ts` (New)

```typescript
export async function showApprovalDialog(
  toolName: string,
  args: string | undefined,
  agentName: string,
): Promise<boolean>
```

- Checks `process.platform === "darwin"`
- On non-macOS: logs warning, returns `true`
- On macOS: constructs osascript command with escaped inputs
- Dialog text: "Agent '{agentName}' wants to call {toolName}" with arguments shown below
- Buttons: ["Deny", "Approve"] (Approve is default)
- Returns `true` if osascript output contains "Approve", `false` otherwise (deny or dialog closed)

### `packages/proxy/src/approvals/handler.ts` (New)

```typescript
export class ApprovalHandler {
  constructor(relayClient: RelayClient)
  register(): void
  private handleApprovalRequest(msg: ApprovalRequestMessage): Promise<void>
}
```

- `register()` calls `relayClient.registerHandler("approval_request", ...)`
- `handleApprovalRequest()`:
  1. Starts a TTL timer based on `msg.ttl_seconds`
  2. Calls `showApprovalDialog(msg.tool_name, msg.arguments, msg.agent_name)`
  3. Clears TTL timer
  4. Sends `approval_response` with `id: msg.id` and `status: "approved" | "denied"`
  5. If TTL fires first, sends `status: "denied"` and the dialog result is ignored

### `packages/proxy/src/index.ts` (Modified)

Add exports:
```typescript
export { ApprovalHandler } from "./approvals/handler.js";
export { showApprovalDialog } from "./approvals/dialog.js";
```

## Test Coverage

### `packages/proxy/tests/approvals/dialog.test.ts`

- macOS: exec returns button "Approve" → returns `true`
- macOS: exec returns button "Deny" → returns `false`
- macOS: exec rejects (dialog closed / user cancelled) → returns `false`
- Non-macOS: auto-approves with console warning
- Special characters in tool name / arguments are escaped

### `packages/proxy/tests/approvals/handler.test.ts`

- Registers `approval_request` handler on relay client
- Approved dialog → sends `approval_response` with `status: "approved"` and same `id`
- Denied dialog → sends `approval_response` with `status: "denied"` and same `id`
- TTL timeout → sends `approval_response` with `status: "denied"` before dialog resolves

### Existing test file `packages/proxy/tests/hooks/approval.test.ts`

No changes needed — it already tests the Docker-side hook with relay mocks.
