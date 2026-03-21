import type { RelayClient } from "../relay/client.js";
import type { CredentialService } from "./service.js";
import type { CredentialRequestMessage, RelayMessage } from "../relay/messages.js";

/**
 * Host-side handler that bridges RelayClient credential_request messages
 * to CredentialService and sends back credential_response messages.
 *
 * Used by the host proxy to handle credential requests from the Docker proxy
 * over the relay WebSocket.
 */
export class CredentialRelayHandler {
  constructor(
    private readonly relayClient: RelayClient,
    private readonly credentialService: CredentialService,
  ) {}

  /**
   * Register a credential_request handler on the relay client.
   * When a credential_request message arrives, it is forwarded to the
   * CredentialService and the response is sent back as a credential_response.
   */
  register(): void {
    this.relayClient.registerHandler("credential_request", (msg: RelayMessage) => {
      void this.handleCredentialRequest(msg as CredentialRequestMessage);
    });
  }

  private async handleCredentialRequest(msg: CredentialRequestMessage): Promise<void> {
    try {
      const response = await this.credentialService.handleRequest({
        id: msg.id,
        key: msg.key,
        agentId: msg.agentId,
        role: msg.role,
        sessionId: msg.sessionId,
        declaredCredentials: msg.declaredCredentials,
      });

      // Send credential_response with same id for correlation
      this.relayClient.send({
        id: msg.id,
        type: "credential_response",
        key: response.key,
        ...("value" in response
          ? { value: response.value, source: response.source }
          : { error: response.error, code: response.code }),
      } as RelayMessage);
    } catch (err) {
      // If the service throws, send an error response
      this.relayClient.send({
        id: msg.id,
        type: "credential_response",
        key: msg.key,
        error: err instanceof Error ? err.message : String(err),
      } as RelayMessage);
    }
  }
}
