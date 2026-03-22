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
  /** Max reconnection attempts before giving up. Default: 10. */
  maxReconnectAttempts?: number;
  /** Initial reconnect delay in ms (doubles each attempt, caps at 8s). Default: 500. */
  reconnectDelayMs?: number;
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
 *
 * Automatically reconnects with exponential backoff on unexpected disconnects.
 */
export class RelayClient {
  private readonly url: string;
  private readonly token: string;
  private readonly defaultTimeoutMs: number;
  private readonly maxReconnectAttempts: number;
  private readonly baseReconnectDelayMs: number;
  private ws: WebSocket | null = null;
  private readonly handlers = new Map<string, (msg: RelayMessage) => void>();
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private intentionalDisconnect = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: RelayClientConfig) {
    this.url = config.url;
    this.token = config.token;
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? 30_000;
    this.maxReconnectAttempts = config.maxReconnectAttempts ?? 10;
    this.baseReconnectDelayMs = config.reconnectDelayMs ?? 500;
  }

  /**
   * Establish a WebSocket connection to the relay server.
   * Retries with exponential backoff on initial connection failure.
   * Resolves when the connection is open. Rejects after all retries exhausted.
   */
  async connect(): Promise<void> {
    this.intentionalDisconnect = false;
    this.reconnectAttempts = 0;

    let attempts = 0;
    const maxAttempts = this.maxReconnectAttempts;
    let delay = this.baseReconnectDelayMs;

    while (true) {
      try {
        await this.connectOnce();
        return;
      } catch (err) {
        attempts++;
        if (attempts >= maxAttempts) {
          throw err;
        }
        await new Promise<void>((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, 8_000);
      }
    }
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
   * Stops auto-reconnect.
   */
  disconnect(): void {
    this.intentionalDisconnect = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

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

  /** Single connection attempt — no retries. */
  private connectOnce(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.url, {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      const onOpen = (): void => {
        cleanup();
        this.ws = ws;
        this.reconnectAttempts = 0;

        ws.on("message", (data) => {
          this.handleMessage(data);
        });

        ws.on("close", () => {
          if (this.ws === ws) {
            this.rejectAllPending("Relay client disconnected");
            this.ws = null;
            this.scheduleReconnect();
          }
        });

        ws.on("error", () => {
          if (this.ws === ws) {
            this.rejectAllPending("Relay client disconnected");
            this.ws = null;
            // close event will fire after error, reconnect happens there
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

  /** Schedule a reconnect attempt with exponential backoff. */
  private scheduleReconnect(): void {
    if (this.intentionalDisconnect) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;

    const delay = Math.min(
      this.baseReconnectDelayMs * Math.pow(2, this.reconnectAttempts),
      8_000,
    );
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectOnce().then(
        () => {
          this.reconnectAttempts = 0;
        },
        () => {
          // Failed — schedule another attempt
          this.scheduleReconnect();
        },
      );
    }, delay);
  }

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
