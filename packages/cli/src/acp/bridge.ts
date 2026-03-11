/**
 * ACP Bridge — Bidirectional ACP <-> Container Communication
 *
 * Transparent HTTP relay that bridges ACP protocol messages between
 * a host-side endpoint (where editors connect) and a container-side
 * ACP agent endpoint (inside Docker).
 *
 * Supports deferred agent startup: when `onSessionNew` is set, the bridge
 * intercepts the first POST request, extracts a `cwd` field from the body,
 * and calls the callback to launch the agent container before relaying.
 *
 * PRD refs: REQ-001 (ACP endpoint), REQ-005 (ACP Session CWD Support),
 *           PRD 7.1 (Architecture), PRD 7.4 (Tool Call Flow)
 */

import {
  createServer,
  request as httpRequest,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

// ── Types ─────────────────────────────────────────────────────────────

export interface AcpBridgeConfig {
  /** Port to listen on for ACP clients (e.g., 3001) */
  hostPort: number;
  /** Docker container hostname (e.g., "localhost") */
  containerHost: string;
  /** ACP agent port inside container (e.g., 3002) */
  containerPort: number;
  /** Maximum retries when connecting to agent (default: 10) */
  connectRetries?: number;
  /** Delay between retries in ms (default: 1000) */
  connectRetryDelayMs?: number;
  /** Idle timeout in ms before emitting onClientDisconnect (default: 30000) */
  idleTimeoutMs?: number;
  /** Request timeout in ms for relay requests to the agent (default: 30000) */
  requestTimeoutMs?: number;
}

// ── Hop-by-hop headers to strip when relaying ─────────────────────────

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
]);

// ── AcpBridge ─────────────────────────────────────────────────────────

export class AcpBridge {
  private config: Required<
    Pick<AcpBridgeConfig, "hostPort" | "containerHost" | "containerPort" | "connectRetries" | "connectRetryDelayMs" | "idleTimeoutMs" | "requestTimeoutMs">
  >;
  private server: Server | null = null;
  private agentConnected = false;
  private clientSeen = false;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionPending = false;

  /** Invoked when the first client request arrives. */
  onClientConnect?: () => void;

  /** Invoked when the client goes idle (no requests for idleTimeoutMs). */
  onClientDisconnect?: () => void;

  /** Invoked when a relay to the agent fails. */
  onAgentError?: (error: Error) => void;

  /**
   * Invoked when a session-initiating POST request arrives and the agent
   * is not yet connected. The bridge buffers the request body, extracts
   * the `cwd` field (if present), and calls this callback. The callback
   * should start the agent container and call `connectToAgent()`.
   * After the callback resolves, the buffered request is relayed.
   *
   * If not set, the bridge behaves as before (returns 503 when agent
   * is not connected).
   */
  onSessionNew?: (cwd: string) => Promise<void>;

  constructor(config: AcpBridgeConfig) {
    this.config = {
      hostPort: config.hostPort,
      containerHost: config.containerHost,
      containerPort: config.containerPort,
      connectRetries: config.connectRetries ?? 10,
      connectRetryDelayMs: config.connectRetryDelayMs ?? 1000,
      idleTimeoutMs: config.idleTimeoutMs ?? 30_000,
      requestTimeoutMs: config.requestTimeoutMs ?? 30_000,
    };
  }

  /**
   * Return the actual port the HTTP server is listening on.
   * Useful when `hostPort` was 0 (OS-assigned).
   */
  getPort(): number {
    const addr = this.server?.address();
    if (addr && typeof addr === "object") return addr.port;
    return this.config.hostPort;
  }

  /**
   * Start the host-side HTTP server that accepts ACP client connections.
   * Requests are proxied to the container agent once `connectToAgent()` succeeds.
   */
  async start(): Promise<void> {
    if (this.server) return;

    this.server = createServer((req, res) => {
      this.handleRequest(req, res);
    });

    const server = this.server;
    return new Promise<void>((resolve, reject) => {
      server.on("error", reject);
      server.listen(this.config.hostPort, () => {
        server.removeListener("error", reject);
        resolve();
      });
    });
  }

  /**
   * Verify the container ACP agent endpoint is reachable.
   * Retries up to `connectRetries` times with `connectRetryDelayMs` delay.
   */
  async connectToAgent(): Promise<void> {
    const { containerHost, containerPort, connectRetries, connectRetryDelayMs } = this.config;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= connectRetries; attempt++) {
      try {
        await this.healthCheck(containerHost, containerPort);
        this.agentConnected = true;
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < connectRetries) {
          await delay(connectRetryDelayMs);
        }
      }
    }

    throw new Error(
      `Failed to connect to ACP agent at ${containerHost}:${containerPort} after ${connectRetries + 1} attempts: ${lastError?.message ?? "unknown error"}`,
    );
  }

  /**
   * Stop the bridge: close the HTTP server and release resources.
   */
  async stop(): Promise<void> {
    this.clearIdleTimer();
    this.agentConnected = false;
    this.clientSeen = false;
    this.sessionPending = false;

    const server = this.server;
    if (!server) return;

    this.server = null;
    return new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Reset bridge state for a new session. Called after agent disconnect
   * so the bridge can accept a new `session/new` from the next client.
   * The HTTP server remains running.
   */
  resetForNewSession(): void {
    this.clearIdleTimer();
    this.agentConnected = false;
    this.clientSeen = false;
    this.sessionPending = false;
  }

  // ── Request Handling ──────────────────────────────────────────────

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    // Health endpoint — always available
    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    // If agent is not connected and we have a session handler, try deferred start
    if (!this.agentConnected && this.onSessionNew && req.method === "POST") {
      // Prevent concurrent session starts
      if (this.sessionPending) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Session startup in progress" }));
        return;
      }
      this.handleDeferredSession(req, res);
      return;
    }

    // Agent must be connected for relay
    if (!this.agentConnected) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Agent not connected" }));
      return;
    }

    // Track client connection
    if (!this.clientSeen) {
      this.clientSeen = true;
      this.onClientConnect?.();
    }
    this.resetIdleTimer();

    // Relay to container agent
    this.relayToAgent(req, res);
  }

  /**
   * Handle a POST request when the agent is not yet connected.
   * Buffer the body, extract `cwd`, call `onSessionNew`, then relay.
   */
  private handleDeferredSession(req: IncomingMessage, res: ServerResponse): void {
    this.sessionPending = true;
    const chunks: Buffer[] = [];

    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const cwd = extractCwdFromBody(body);

      const sessionNewHandler = this.onSessionNew;
      if (!sessionNewHandler) {
        this.sessionPending = false;
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Agent not connected" }));
        return;
      }

      void sessionNewHandler(cwd).then(() => {
        this.sessionPending = false;

        // Track client connection
        if (!this.clientSeen) {
          this.clientSeen = true;
          this.onClientConnect?.();
        }
        this.resetIdleTimer();

        // Now relay the buffered request to the agent
        this.relayBufferedToAgent(req, res, body);
      }).catch((err) => {
        this.sessionPending = false;
        const message = err instanceof Error ? err.message : String(err);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: `Session startup failed: ${message}` }));
        }
      });
    });

    req.on("error", () => {
      this.sessionPending = false;
      if (!res.headersSent) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Request read error" }));
      }
    });
  }

  /**
   * Relay a buffered request body to the agent (used after deferred session start).
   */
  private relayBufferedToAgent(
    clientReq: IncomingMessage,
    clientRes: ServerResponse,
    body: Buffer,
  ): void {
    const { containerHost, containerPort, requestTimeoutMs } = this.config;

    // Build relay headers, stripping hop-by-hop
    const relayHeaders: Record<string, string | string[]> = {};
    for (const [key, value] of Object.entries(clientReq.headers)) {
      if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase()) && value !== undefined) {
        relayHeaders[key] = value;
      }
    }
    // Set correct content-length for the buffered body
    relayHeaders["content-length"] = String(body.length);

    const agentReq = httpRequest(
      {
        hostname: containerHost,
        port: containerPort,
        path: clientReq.url ?? "/",
        method: clientReq.method ?? "POST",
        headers: relayHeaders,
        timeout: requestTimeoutMs,
      },
      (agentRes) => {
        const responseHeaders: Record<string, string | string[] | undefined> = {};
        for (const [key, value] of Object.entries(agentRes.headers)) {
          if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
            responseHeaders[key] = value;
          }
        }

        clientRes.writeHead(agentRes.statusCode ?? 200, responseHeaders);
        agentRes.pipe(clientRes);
      },
    );

    agentReq.on("error", (err) => {
      const error = new Error(`Agent relay failed: ${err.message}`);
      this.onAgentError?.(error);

      if (!clientRes.headersSent) {
        clientRes.writeHead(502, { "Content-Type": "application/json" });
        clientRes.end(JSON.stringify({ error: "Bad Gateway — agent unreachable" }));
      }
    });

    agentReq.on("timeout", () => {
      agentReq.destroy(new Error("Agent request timed out"));
    });

    // Write the buffered body instead of piping
    agentReq.end(body);
  }

  private relayToAgent(clientReq: IncomingMessage, clientRes: ServerResponse): void {
    const { containerHost, containerPort, requestTimeoutMs } = this.config;

    // Build relay headers, stripping hop-by-hop
    const relayHeaders: Record<string, string | string[]> = {};
    for (const [key, value] of Object.entries(clientReq.headers)) {
      if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase()) && value !== undefined) {
        relayHeaders[key] = value;
      }
    }

    const agentReq = httpRequest(
      {
        hostname: containerHost,
        port: containerPort,
        path: clientReq.url ?? "/",
        method: clientReq.method ?? "GET",
        headers: relayHeaders,
        timeout: requestTimeoutMs,
      },
      (agentRes) => {
        // Relay response headers, stripping hop-by-hop
        const responseHeaders: Record<string, string | string[] | undefined> = {};
        for (const [key, value] of Object.entries(agentRes.headers)) {
          if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
            responseHeaders[key] = value;
          }
        }

        clientRes.writeHead(agentRes.statusCode ?? 200, responseHeaders);
        agentRes.pipe(clientRes);
      },
    );

    agentReq.on("error", (err) => {
      const error = new Error(`Agent relay failed: ${err.message}`);
      this.onAgentError?.(error);

      if (!clientRes.headersSent) {
        clientRes.writeHead(502, { "Content-Type": "application/json" });
        clientRes.end(JSON.stringify({ error: "Bad Gateway — agent unreachable" }));
      }
    });

    agentReq.on("timeout", () => {
      agentReq.destroy(new Error("Agent request timed out"));
    });

    // Pipe client request body to agent
    clientReq.pipe(agentReq);
  }

  // ── Health Check ──────────────────────────────────────────────────

  private healthCheck(host: string, port: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const req = httpRequest(
        { hostname: host, port, path: "/", method: "GET", timeout: 5000 },
        (res) => {
          // Drain the response
          res.resume();
          if (res.statusCode && res.statusCode < 500) {
            resolve();
          } else {
            reject(new Error(`Agent health check returned status ${res.statusCode}`));
          }
        },
      );
      req.on("error", (err) => reject(err));
      req.on("timeout", () => {
        req.destroy(new Error("Health check timed out"));
      });
      req.end();
    });
  }

  // ── Idle Timer ────────────────────────────────────────────────────

  private resetIdleTimer(): void {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      this.onClientDisconnect?.();
      this.clientSeen = false;
    }, this.config.idleTimeoutMs);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Attempt to extract a `cwd` field from a JSON request body.
 * Handles both JSON-RPC style (`params.cwd`) and flat (`cwd`) formats.
 * Returns `process.cwd()` if extraction fails or `cwd` is not present.
 */
export function extractCwdFromBody(body: Buffer): string {
  try {
    const parsed = JSON.parse(body.toString("utf-8")) as Record<string, unknown>;

    // Check params.cwd (JSON-RPC style)
    if (parsed.params && typeof parsed.params === "object") {
      const params = parsed.params as Record<string, unknown>;
      if (typeof params.cwd === "string" && params.cwd.length > 0) {
        return params.cwd;
      }
    }

    // Check top-level cwd
    if (typeof parsed.cwd === "string" && parsed.cwd.length > 0) {
      return parsed.cwd;
    }
  } catch {
    // Not valid JSON — fall through to default
  }

  return process.cwd();
}
