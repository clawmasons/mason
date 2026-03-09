import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { WebSocket } from "ws";
import { createServer, type Server as HttpServer } from "node:http";
import { CredentialRelay } from "../../src/handlers/credential-relay.js";
import { SessionStore } from "../../src/handlers/connect-agent.js";

// ── Test port management ────────────────────────────────────────────

let nextPort = 19500;
function getPort(): number {
  return nextPort++;
}

// ── Helper: create a simple WebSocket client ─────────────────────────

function connectWs(port: number, path: string, token?: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const ws = new WebSocket(`ws://localhost:${port}${path}`, { headers });
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

// ── CredentialRelay Unit Tests ──────────────────────────────────────

describe("CredentialRelay", () => {
  let relay: CredentialRelay;
  let sessionStore: SessionStore;
  let httpServer: HttpServer;
  let port: number;

  beforeEach(async () => {
    port = getPort();
    sessionStore = new SessionStore();
    relay = new CredentialRelay({
      credentialProxyToken: "cred-token-123",
      requestTimeoutMs: 2000,
    });

    httpServer = createServer((_req, res) => {
      res.writeHead(404);
      res.end();
    });

    httpServer.on("upgrade", (req, socket, head) => {
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);
      if (url.pathname === "/ws/credentials") {
        relay.handleUpgrade(req, socket, head as Buffer);
      } else {
        socket.destroy();
      }
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(port, resolve);
    });
  });

  afterEach(async () => {
    relay.close();
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("accepts credential service WebSocket with valid token", async () => {
    const ws = await connectWs(port, "/ws/credentials", "cred-token-123");
    expect(ws.readyState).toBe(WebSocket.OPEN);
    expect(relay.isCredentialServiceConnected).toBe(true);
    ws.close();
  });

  it("rejects credential service WebSocket with invalid token", async () => {
    await expect(
      connectWs(port, "/ws/credentials", "wrong-token"),
    ).rejects.toThrow();
    expect(relay.isCredentialServiceConnected).toBe(false);
  });

  it("rejects credential service WebSocket with no token", async () => {
    await expect(
      connectWs(port, "/ws/credentials"),
    ).rejects.toThrow();
    expect(relay.isCredentialServiceConnected).toBe(false);
  });

  it("replaces previous credential service connection", async () => {
    const ws1 = await connectWs(port, "/ws/credentials", "cred-token-123");
    expect(relay.isCredentialServiceConnected).toBe(true);

    const ws2 = await connectWs(port, "/ws/credentials", "cred-token-123");
    expect(relay.isCredentialServiceConnected).toBe(true);

    // Wait a tick for the close to propagate
    await new Promise((r) => setTimeout(r, 50));

    // ws1 should be closed
    expect(ws1.readyState).toBe(WebSocket.CLOSED);
    expect(ws2.readyState).toBe(WebSocket.OPEN);

    ws2.close();
  });

  it("returns error for invalid session token", async () => {
    const ws = await connectWs(port, "/ws/credentials", "cred-token-123");

    const result = await relay.handleCredentialRequest(
      sessionStore,
      "API_KEY",
      "invalid-token",
    );

    expect(result.error).toBe("Invalid session token");
    expect(result.key).toBe("API_KEY");
    ws.close();
  });

  it("returns error when credential service is not connected", async () => {
    const session = sessionStore.create("test-agent", "test-role");

    const result = await relay.handleCredentialRequest(
      sessionStore,
      "API_KEY",
      session.sessionToken,
    );

    expect(result.error).toBe("Credential service not connected");
  });

  it("forwards request to credential service and returns response", async () => {
    const ws = await connectWs(port, "/ws/credentials", "cred-token-123");

    // Credential service handler: echo back resolved value
    ws.on("message", (data) => {
      const request = JSON.parse(data.toString());
      ws.send(JSON.stringify({
        id: request.id,
        key: request.key,
        value: "resolved-value-123",
        source: "env",
      }));
    });

    const session = sessionStore.create("test-agent", "test-role");

    const result = await relay.handleCredentialRequest(
      sessionStore,
      "OPENAI_API_KEY",
      session.sessionToken,
      ["OPENAI_API_KEY"],
    );

    expect(result.key).toBe("OPENAI_API_KEY");
    expect(result.value).toBe("resolved-value-123");
    expect(result.source).toBe("env");
    expect(result.error).toBeUndefined();

    ws.close();
  });

  it("forwards error response from credential service", async () => {
    const ws = await connectWs(port, "/ws/credentials", "cred-token-123");

    ws.on("message", (data) => {
      const request = JSON.parse(data.toString());
      ws.send(JSON.stringify({
        id: request.id,
        key: request.key,
        error: "Access denied: credential not declared",
        code: "ACCESS_DENIED",
      }));
    });

    const session = sessionStore.create("test-agent", "test-role");

    const result = await relay.handleCredentialRequest(
      sessionStore,
      "SECRET_KEY",
      session.sessionToken,
    );

    expect(result.key).toBe("SECRET_KEY");
    expect(result.error).toBe("Access denied: credential not declared");
    expect(result.value).toBeUndefined();

    ws.close();
  });

  it("times out when credential service does not respond", async () => {
    // Create relay with very short timeout
    relay.close();
    relay = new CredentialRelay({
      credentialProxyToken: "cred-token-123",
      requestTimeoutMs: 100,
    });

    // Re-register upgrade handler
    httpServer.removeAllListeners("upgrade");
    httpServer.on("upgrade", (req, socket, head) => {
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);
      if (url.pathname === "/ws/credentials") {
        relay.handleUpgrade(req, socket, head as Buffer);
      } else {
        socket.destroy();
      }
    });

    const ws = await connectWs(port, "/ws/credentials", "cred-token-123");

    // Credential service doesn't respond
    ws.on("message", () => {
      // intentionally do nothing
    });

    const session = sessionStore.create("test-agent", "test-role");

    const result = await relay.handleCredentialRequest(
      sessionStore,
      "API_KEY",
      session.sessionToken,
    );

    expect(result.error).toBe("Credential request timed out");

    ws.close();
  });

  it("sends correct request shape to credential service", async () => {
    const ws = await connectWs(port, "/ws/credentials", "cred-token-123");

    const receivedMessages: unknown[] = [];
    ws.on("message", (data) => {
      const request = JSON.parse(data.toString());
      receivedMessages.push(request);
      ws.send(JSON.stringify({
        id: request.id,
        key: request.key,
        value: "test",
        source: "env",
      }));
    });

    const session = sessionStore.create("my-agent", "my-role");

    await relay.handleCredentialRequest(
      sessionStore,
      "MY_KEY",
      session.sessionToken,
      ["MY_KEY", "OTHER_KEY"],
    );

    expect(receivedMessages).toHaveLength(1);
    const msg = receivedMessages[0] as Record<string, unknown>;
    expect(msg.id).toBeDefined();
    expect(msg.key).toBe("MY_KEY");
    expect(msg.agentId).toBe("my-agent");
    expect(msg.role).toBe("my-role");
    expect(msg.sessionId).toBe(session.sessionId);
    expect(msg.declaredCredentials).toEqual(["MY_KEY", "OTHER_KEY"]);

    ws.close();
  });

  it("tracks pending request count", async () => {
    const ws = await connectWs(port, "/ws/credentials", "cred-token-123");

    // Don't respond immediately
    const requests: Array<{ id: string; key: string }> = [];
    ws.on("message", (data) => {
      requests.push(JSON.parse(data.toString()));
    });

    const session = sessionStore.create("test-agent", "test-role");

    expect(relay.pendingRequestCount).toBe(0);

    // Start a request (won't resolve until we respond)
    const promise = relay.handleCredentialRequest(
      sessionStore,
      "KEY",
      session.sessionToken,
    );

    // Give time for the message to send
    await new Promise((r) => setTimeout(r, 50));

    expect(relay.pendingRequestCount).toBe(1);

    // Now respond
    ws.send(JSON.stringify({
      id: requests[0].id,
      key: requests[0].key,
      value: "val",
      source: "env",
    }));

    await promise;
    expect(relay.pendingRequestCount).toBe(0);

    ws.close();
  });

  it("handles credential service disconnection during request", async () => {
    const ws = await connectWs(port, "/ws/credentials", "cred-token-123");

    // Close the WS when receiving a request
    ws.on("message", () => {
      ws.close();
    });

    const session = sessionStore.create("test-agent", "test-role");

    // This should either timeout or get a send error
    const result = await relay.handleCredentialRequest(
      sessionStore,
      "KEY",
      session.sessionToken,
    );

    // Either timeout or send error is acceptable
    expect(result.error).toBeDefined();
  });
});
