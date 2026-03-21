import { WebSocket } from "ws";
import { parseRelayMessage, type RelayMessage } from "./messages.js";

// ── Types ──────────────────────────────────────────────────────────────

export interface RelayClientConfig {
  /** WebSocket URL to connect to (e.g. ws://localhost:9090/ws/relay). */
  url: string;
  /** Bearer token for authenticating with the relay server. */
  token: string;
  /** Default timeout for request() calls in milliseconds. Default: 30000. */
  defaultTimeoutMs?: number;
}

interface PendingRequest {
  resolve: (msg: RelayMessage) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ── RelayClient ────────────────────────────────────────────────────────

/**
 * Host-side WebSocket client for the relay protocol.
 *
 * Connects to the Docker proxy's `/ws/relay` endpoint with bearer token
 * authentication, dispatches incoming messages to registered handlers by
 * type, and supports correlated request/response with configurable timeouts.
 */
export class RelayClient {
  private readonly url: string;
  private readonly token: string;
  private readonly defaultTimeoutMs: number;
  private ws: WebSocket | null = null;
  private readonly handlers = new Map<string, (msg: RelayMessage) => void>();
  private readonly pendingRequests = new Map<string, PendingRequest>();

  constructor(config: RelayClientConfig) {
    this.url = config.url;
    this.token = config.token;
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? 30_000;
  }

  /**
   * Establish a WebSocket connection to the relay server.
   * Resolves when the connection is open. Rejects on auth failure or error.
   */
  connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.url, {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      const onOpen = (): void => {
        cleanup();
        this.ws = ws;

        ws.on("message", (data) => {
          this.handleMessage(data);
        });

        ws.on("close", () => {
          if (this.ws === ws) {
            this.rejectAllPending("Relay client disconnected");
            this.ws = null;
          }
        });

        ws.on("error", () => {
          if (this.ws === ws) {
            this.rejectAllPending("Relay client disconnected");
            this.ws = null;
          }
        });

        resolve();
      };

      const onError = (err: Error): void => {
        cleanup();
        reject(err);
      };

      const cleanup = (): void => {
        ws.removeListener("open", onOpen);
        ws.removeListener("error", onError);
      };

      ws.on("open", onOpen);
      ws.on("error", onError);
    });
  }

  /**
   * Register a handler for a specific relay message type.
   * Only one handler per type is supported — later registrations replace earlier ones.
   */
  registerHandler(type: string, handler: (msg: RelayMessage) => void): void {
    this.handlers.set(type, handler);
  }

  /**
   * Send a message to the Docker proxy.
   * Throws if no connection is active.
   */
  send(message: RelayMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Relay client not connected");
    }
    this.ws.send(JSON.stringify(message));
  }

  /**
   * Send a message and await a correlated response (matched by `id`).
   * Rejects if not connected or if the timeout expires.
   */
  request(message: RelayMessage, timeoutMs?: number): Promise<RelayMessage> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Relay client not connected"));
    }

    const timeout = timeoutMs ?? this.defaultTimeoutMs;

    const ws = this.ws;

    return new Promise<RelayMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(message.id);
        reject(new Error(`Relay request timed out after ${timeout}ms`));
      }, timeout);

      this.pendingRequests.set(message.id, { resolve, reject, timer });

      ws.send(JSON.stringify(message), (err) => {
        if (err) {
          clearTimeout(timer);
          this.pendingRequests.delete(message.id);
          reject(new Error(`Failed to send relay request: ${err.message}`));
        }
      });
    });
  }

  /**
   * Disconnect from the relay server.
   * Rejects all pending requests and closes the WebSocket. No-op if not connected.
   */
  disconnect(): void {
    if (!this.ws) {
      return;
    }

    this.rejectAllPending("Relay client disconnected");

    this.ws.close(1000, "Client disconnecting");
    this.ws = null;
  }

  /** Whether the client is currently connected to the relay server. */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  // ── Private ──────────────────────────────────────────────────────────

  private handleMessage(data: unknown): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(data));
    } catch {
      return; // Invalid JSON — ignore
    }

    const result = parseRelayMessage(parsed);
    if (!result.success) {
      return; // Invalid relay message — ignore
    }

    const message = result.data;

    // Check pending requests first (response correlation by id)
    const pending = this.pendingRequests.get(message.id);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingRequests.delete(message.id);
      pending.resolve(message);
      return;
    }

    // Dispatch to registered handler by type
    const handler = this.handlers.get(message.type);
    if (handler) {
      handler(message);
    }
    // Unknown type with no handler — silently ignore
  }

  private rejectAllPending(reason: string): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
      this.pendingRequests.delete(id);
    }
  }
}
