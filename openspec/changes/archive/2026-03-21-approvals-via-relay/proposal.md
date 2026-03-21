## Why

The Docker proxy's approval hook (`hooks/approval.ts`) already sends `approval_request` messages over the relay and awaits `approval_response` (wired in Change 6). However, there is no host-side handler to receive these requests, present a dialog to the operator, and send back a response. Without the host-side handler, any tool call matching an approval pattern will time out and be denied.

This change creates the host-side approval handler and a native macOS dialog using `osascript`, completing the approval flow end-to-end: Docker proxy sends `approval_request` over relay, host proxy shows a dialog, operator clicks Approve/Deny, host proxy sends `approval_response` back.

## What Changes

- New `packages/proxy/src/approvals/dialog.ts` — `showApprovalDialog(toolName, args, agentName): Promise<boolean>` function that invokes `osascript` to display a native macOS dialog. On non-macOS platforms, auto-approves with a warning log.
- New `packages/proxy/src/approvals/handler.ts` — `ApprovalHandler` class that registers for `approval_request` on a `RelayClient`, invokes the dialog, and sends `approval_response`. Handles TTL timeout by sending `status: "denied"`.
- New `packages/proxy/tests/approvals/dialog.test.ts` — tests for approve/deny/close paths with mocked `child_process.exec`.
- New `packages/proxy/tests/approvals/handler.test.ts` — tests for handler registration, message flow, TTL timeout.
- Modify `packages/proxy/src/index.ts` — export `ApprovalHandler` and `showApprovalDialog`.

## Capabilities

### New Capabilities
- `approval-dialog`: Native macOS osascript dialog for tool call approvals, with non-macOS fallback.
- `approval-handler`: Host-side relay handler that bridges `approval_request` messages to the dialog and sends `approval_response`.

### Modified Capabilities
- `proxy-exports`: `index.ts` exports the new approval handler and dialog.

## Impact

- **No breaking changes** — the Docker-side approval hook is unchanged (already relay-based from Change 6).
- **No existing tests affected** — existing `hooks/approval.test.ts` tests the Docker-side hook, which remains as-is.
- Future Change 8 (Host Proxy Orchestrator) will wire `ApprovalHandler` into the `HostProxy` class.

## Dependencies

- Change 3 (RelayClient) — `ApprovalHandler` takes a `RelayClient` instance.
- Change 6 (Audit Events / SQLite Removal) — Docker-side approval hook already sends relay messages.
