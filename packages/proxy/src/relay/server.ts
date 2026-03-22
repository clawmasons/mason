import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import { parseRelayMessage, type RelayMessage } from "./messages.js";

// ── Types ──────────────────────────────────────────────────────────────

export interface RelayServerConfig {
  /** Bearer token for authenticating host proxy WebSocket connections. */
  token: string;
  /** Default timeout for request() calls in milliseconds. Default: 30000. */
  defaultTimeoutMs?: number;
}

interface PendingRequest {
  resolve: (msg: RelayMessage) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ── RelayServer ────────────────────────────────────────────────────────

/**
 * Docker-side WebSocket server for the relay protocol.
 *
 * Accepts a single connection from the host proxy at `/ws/relay`,
 * authenticates with bearer token, dispatches incoming messages to
 * registered handlers by type, and supports correlated request/response.
 */
export class RelayServer {
  private readonly token: string;
  private readonly defaultTimeoutMs: number;
  private readonly wss: WebSocketServer;
  private ws: WebSocket | null = null;
  private readonly handlers = new Map<string, (msg: RelayMessage) => void>();
  private readonly pendingRequests = new Map<string, PendingRequest>();

  constructor(config: RelayServerConfig) {
    this.token = config.token;
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? 30_000;
    this.wss = new WebSocketServer({ noServer: true });
  }

  /**
   * Handle an HTTP upgrade request for the /ws/relay endpoint.
   * Authenticates with bearer token and accepts the WebSocket connection.
   */
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const auth = req.headers.authorization;
    if (!auth) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    const [scheme, token] = auth.split(" ", 2);
    if (scheme !== "Bearer" || token !== this.token) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.acceptConnection(ws);
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
   * Send a message to the connected host proxy.
   * Throws if no connection is active.
   */
  send(message: RelayMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Relay not connected");
    }
    this.ws.send(JSON.stringify(message));
  }

  /**
   * Send a message and await a correlated response (matched by `id`).
   * Rejects if not connected or if the timeout expires.
   */
  request(message: RelayMessage, timeoutMs?: number): Promise<RelayMessage> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Relay not connected"));
    }

    const timeout = timeoutMs ?? this.defaultTimeoutMs;

    return new Promise<RelayMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(message.id);
        reject(new Error(`Relay request timed out after ${timeout}ms`));
      }, timeout);

      this.pendingRequests.set(message.id, { resolve, reject, timer });

      this.ws!.send(JSON.stringify(message), (err) => {
        if (err) {
          clearTimeout(timer);
          this.pendingRequests.delete(message.id);
          reject(new Error(`Failed to send relay request: ${err.message}`));
        }
      });
    });
  }

  /** Whether a host proxy WebSocket is currently connected. */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Wait for a host proxy client to connect.
   * Resolves immediately if already connected, otherwise waits up to `timeoutMs`.
   */
  waitForConnection(timeoutMs: number = 5_000): Promise<void> {
    if (this.isConnected()) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        clearInterval(poller);
        reject(new Error("Timed out waiting for relay connection"));
      }, timeoutMs);

      const poller = setInterval(() => {
        if (this.isConnected()) {
          clearTimeout(timer);
          clearInterval(poller);
          resolve();
        }
      }, 100);
    });
  }

  /** Shut down the relay server: reject pending requests, close connection, close WSS. */
  shutdown(): void {
    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Relay shutting down"));
      this.pendingRequests.delete(id);
    }

    if (this.ws) {
      this.ws.close(1000, "Relay shutting down");
      this.ws = null;
    }

    this.wss.close();
  }

  // ── Private ──────────────────────────────────────────────────────────

  private acceptConnection(ws: WebSocket): void {
    // Close previous connection if any
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close(1000, "Replaced by new connection");
    }

    this.ws = ws;

    ws.on("message", (data) => {
      this.handleMessage(data);
    });

    ws.on("close", () => {
      if (this.ws === ws) {
        this.ws = null;
      }
    });

    ws.on("error", () => {
      if (this.ws === ws) {
        this.ws = null;
      }
    });
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
}
