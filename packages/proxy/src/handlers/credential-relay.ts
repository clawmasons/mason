import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import type { SessionStore } from "./connect-agent.js";

// ── Types ──────────────────────────────────────────────────────────────

export interface CredentialRelayConfig {
  /** Token the credential service uses to authenticate its WebSocket connection. */
  credentialProxyToken: string;
  /** Timeout for credential requests in milliseconds. Default: 30000. */
  requestTimeoutMs?: number;
}

export interface CredentialToolResult {
  key: string;
  value?: string;
  error?: string;
  source?: string;
}

interface PendingRequest {
  resolve: (result: CredentialToolResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ── CredentialRelay ────────────────────────────────────────────────────

/**
 * Manages the WebSocket connection from the credential service and
 * handles credential_request tool calls from agents.
 */
export class CredentialRelay {
  private readonly credentialProxyToken: string;
  private readonly requestTimeoutMs: number;
  private credentialServiceWs: WebSocket | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private wss: WebSocketServer;

  constructor(config: CredentialRelayConfig) {
    this.credentialProxyToken = config.credentialProxyToken;
    this.requestTimeoutMs = config.requestTimeoutMs ?? 30_000;
    this.wss = new WebSocketServer({ noServer: true });
  }

  /**
   * Handle an HTTP upgrade request for the /ws/credentials endpoint.
   * Authenticates the credential service and accepts the WebSocket connection.
   */
  handleUpgrade(req: IncomingMessage, socket: import("node:stream").Duplex, head: Buffer): void {
    // Authenticate
    const auth = req.headers.authorization;
    if (!auth) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    const [scheme, token] = auth.split(" ", 2);
    if (scheme !== "Bearer" || token !== this.credentialProxyToken) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.acceptCredentialService(ws);
    });
  }

  /**
   * Accept a credential service WebSocket connection.
   * If a previous connection exists, it is closed.
   */
  acceptCredentialService(ws: WebSocket): void {
    // Close previous connection if any
    if (this.credentialServiceWs && this.credentialServiceWs.readyState === WebSocket.OPEN) {
      this.credentialServiceWs.close(1000, "Replaced by new connection");
    }

    this.credentialServiceWs = ws;

    ws.on("message", (data) => {
      this.handleResponse(data);
    });

    ws.on("close", () => {
      if (this.credentialServiceWs === ws) {
        this.credentialServiceWs = null;
      }
    });

    ws.on("error", () => {
      // Error handler to prevent unhandled rejection
      if (this.credentialServiceWs === ws) {
        this.credentialServiceWs = null;
      }
    });
  }

  /**
   * Handle a credential_request tool call from an agent.
   *
   * Validates the session token, forwards the request to the credential service
   * over WebSocket, and returns the response.
   */
  async handleCredentialRequest(
    sessionStore: SessionStore,
    key: string,
    sessionToken: string,
    declaredCredentials?: string[],
  ): Promise<CredentialToolResult> {
    // Validate session token
    const session = sessionStore.getByToken(sessionToken);
    if (!session) {
      return { key, error: "Invalid session token" };
    }

    // Check credential service is connected
    if (!this.credentialServiceWs || this.credentialServiceWs.readyState !== WebSocket.OPEN) {
      return { key, error: "Credential service not connected" };
    }

    // Forward request to credential service
    const requestId = randomUUID();
    const request = {
      id: requestId,
      key,
      agentId: session.agentId,
      role: session.role,
      sessionId: session.sessionId,
      declaredCredentials: declaredCredentials ?? [],
    };

    return new Promise<CredentialToolResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        resolve({ key, error: "Credential request timed out" });
      }, this.requestTimeoutMs);

      this.pendingRequests.set(requestId, { resolve, timer });

      const ws = this.credentialServiceWs;
      if (!ws) {
        clearTimeout(timer);
        this.pendingRequests.delete(requestId);
        resolve({ key, error: "Credential service disconnected" });
        return;
      }
      ws.send(JSON.stringify(request), (err) => {
        if (err) {
          clearTimeout(timer);
          this.pendingRequests.delete(requestId);
          resolve({ key, error: `Failed to send request: ${err.message}` });
        }
      });
    });
  }

  /** Whether the credential service is currently connected. */
  get isCredentialServiceConnected(): boolean {
    return this.credentialServiceWs !== null && this.credentialServiceWs.readyState === WebSocket.OPEN;
  }

  /** Number of in-flight credential requests. */
  get pendingRequestCount(): number {
    return this.pendingRequests.size;
  }

  /** Close the WebSocket server and any active connection. */
  close(): void {
    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.resolve({ key: "unknown", error: "Relay shutting down" });
      this.pendingRequests.delete(id);
    }

    if (this.credentialServiceWs) {
      this.credentialServiceWs.close(1000, "Proxy shutting down");
      this.credentialServiceWs = null;
    }

    this.wss.close();
  }

  // ── Private ──────────────────────────────────────────────────────────

  private handleResponse(data: unknown): void {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(String(data)) as Record<string, unknown>;
    } catch {
      return;
    }

    const id = parsed.id as string | undefined;
    if (!id) return;

    const pending = this.pendingRequests.get(id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingRequests.delete(id);

    // Check if it's an error response
    if ("error" in parsed) {
      pending.resolve({
        key: (parsed.key as string) ?? "unknown",
        error: parsed.error as string,
      });
    } else {
      pending.resolve({
        key: (parsed.key as string) ?? "unknown",
        value: parsed.value as string,
        source: parsed.source as string | undefined,
      });
    }
  }
}
