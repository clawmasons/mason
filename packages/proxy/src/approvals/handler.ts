import type { RelayClient } from "../relay/client.js";
import type { ApprovalRequestMessage, RelayMessage } from "../relay/messages.js";
import { showApprovalDialog } from "./dialog.js";

/**
 * Host-side handler that bridges RelayClient `approval_request` messages
 * to a native macOS dialog and sends back `approval_response` messages.
 *
 * Used by the host proxy to present approval dialogs to the operator
 * when agents attempt to call tools matching approval patterns.
 */
export class ApprovalHandler {
  constructor(private readonly relayClient: RelayClient) {}

  /**
   * Register an `approval_request` handler on the relay client.
   * When an `approval_request` message arrives, a native dialog is shown
   * and the response is sent back as an `approval_response`.
   */
  register(): void {
    this.relayClient.registerHandler("approval_request", (msg: RelayMessage) => {
      void this.handleApprovalRequest(msg as ApprovalRequestMessage);
    });
  }

  private async handleApprovalRequest(msg: ApprovalRequestMessage): Promise<void> {
    let responded = false;

    const sendResponse = (status: "approved" | "denied"): void => {
      if (responded) return;
      responded = true;
      this.relayClient.send({
        id: msg.id,
        type: "approval_response",
        status,
      } as RelayMessage);
    };

    // Set up TTL timeout — auto-deny if dialog isn't answered in time
    const ttlMs = msg.ttl_seconds * 1000;
    const ttlTimer = setTimeout(() => {
      sendResponse("denied");
    }, ttlMs);

    try {
      const approved = await showApprovalDialog(
        msg.tool_name,
        msg.arguments,
        msg.agent_name,
      );
      clearTimeout(ttlTimer);
      sendResponse(approved ? "approved" : "denied");
    } catch {
      clearTimeout(ttlTimer);
      sendResponse("denied");
    }
  }
}
