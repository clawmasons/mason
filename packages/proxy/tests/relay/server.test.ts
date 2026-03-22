import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { WebSocket } from "ws";
import { createServer, type Server as HttpServer } from "node:http";
import { RelayServer } from "../../src/relay/server.js";
import { createRelayMessage, type RelayMessage } from "../../src/relay/messages.js";

// ── Test port management ────────────────────────────────────────────

let nextPort = 19600;
function getPort(): number {
  return nextPort++;
}

// ── Helper: connect WebSocket client ────────────────────────────────

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

function connectWsWithScheme(port: number, path: string, scheme: string, token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}${path}`, {
      headers: { Authorization: `${scheme} ${token}` },
    });
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

// ── Helper: wait for a WebSocket message ────────────────────────────

function waitForMessage(ws: WebSocket): Promise<RelayMessage> {
  return new Promise((resolve) => {
    ws.once("message", (data) => {
      resolve(JSON.parse(data.toString()));
    });
  });
}

// ── RelayServer Tests ───────────────────────────────────────────────

describe("RelayServer", () => {
  let relay: RelayServer;
  let httpServer: HttpServer;
  let port: number;

  beforeEach(async () => {
    port = getPort();
    relay = new RelayServer({
      token: "relay-token-123",
      defaultTimeoutMs: 2000,
    });

    httpServer = createServer((_req, res) => {
      res.writeHead(404);
      res.end();
    });

    httpServer.on("upgrade", (req, socket, head) => {
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);
      if (url.pathname === "/ws/relay") {
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
    await relay.shutdown();
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // ── Authentication ──────────────────────────────────────────────

  describe("Authentication", () => {
    it("accepts WebSocket with valid bearer token", async () => {
      const ws = await connectWs(port, "/ws/relay", "relay-token-123");
      expect(ws.readyState).toBe(WebSocket.OPEN);
      expect(relay.isConnected()).toBe(true);
      ws.close();
    });

    it("rejects WebSocket with invalid bearer token", async () => {
      await expect(
        connectWs(port, "/ws/relay", "wrong-token"),
      ).rejects.toThrow();
      expect(relay.isConnected()).toBe(false);
    });

    it("rejects WebSocket with no authorization header", async () => {
      await expect(
        connectWs(port, "/ws/relay"),
      ).rejects.toThrow();
      expect(relay.isConnected()).toBe(false);
    });

    it("rejects WebSocket with non-Bearer scheme", async () => {
      await expect(
        connectWsWithScheme(port, "/ws/relay", "Basic", "relay-token-123"),
      ).rejects.toThrow();
      expect(relay.isConnected()).toBe(false);
    });
  });

  // ── Connection Management ─────────────────────────────────────────

  describe("Connection management", () => {
    it("isConnected() returns false initially", () => {
      expect(relay.isConnected()).toBe(false);
    });

    it("isConnected() returns true after connection", async () => {
      const ws = await connectWs(port, "/ws/relay", "relay-token-123");
      expect(relay.isConnected()).toBe(true);
      ws.close();
    });

    it("isConnected() returns false after disconnect", async () => {
      const ws = await connectWs(port, "/ws/relay", "relay-token-123");
      expect(relay.isConnected()).toBe(true);

      ws.close();
      await new Promise((r) => setTimeout(r, 50));
      expect(relay.isConnected()).toBe(false);
    });

    it("new connection replaces previous (old connection closed)", async () => {
      const ws1 = await connectWs(port, "/ws/relay", "relay-token-123");
      expect(relay.isConnected()).toBe(true);

      const ws2 = await connectWs(port, "/ws/relay", "relay-token-123");
      expect(relay.isConnected()).toBe(true);

      await new Promise((r) => setTimeout(r, 50));
      expect(ws1.readyState).toBe(WebSocket.CLOSED);
      expect(ws2.readyState).toBe(WebSocket.OPEN);

      ws2.close();
    });
  });

  // ── Message Dispatch ──────────────────────────────────────────────

  describe("Message dispatch", () => {
    it("incoming message dispatched to registered handler by type", async () => {
      const ws = await connectWs(port, "/ws/relay", "relay-token-123");

      const received: RelayMessage[] = [];
      relay.registerHandler("credential_request", (msg) => {
        received.push(msg);
      });

      const msg = createRelayMessage("credential_request", {
        key: "API_KEY",
        agentId: "agent-1",
        role: "dev",
        sessionId: "sess-1",
        declaredCredentials: ["API_KEY"],
      });

      ws.send(JSON.stringify(msg));
      await new Promise((r) => setTimeout(r, 50));

      expect(received).toHaveLength(1);
      expect(received[0].type).toBe("credential_request");
      expect((received[0] as { key: string }).key).toBe("API_KEY");

      ws.close();
    });

    it("unregistered type: message ignored (no crash)", async () => {
      const ws = await connectWs(port, "/ws/relay", "relay-token-123");

      // No handler registered for credential_request
      const msg = createRelayMessage("credential_request", {
        key: "API_KEY",
        agentId: "agent-1",
        role: "dev",
        sessionId: "sess-1",
        declaredCredentials: [],
      });

      ws.send(JSON.stringify(msg));
      await new Promise((r) => setTimeout(r, 50));

      // No crash — server still connected
      expect(relay.isConnected()).toBe(true);
      ws.close();
    });

    it("invalid JSON: ignored (no crash)", async () => {
      const ws = await connectWs(port, "/ws/relay", "relay-token-123");

      ws.send("not valid json {{{");
      await new Promise((r) => setTimeout(r, 50));

      expect(relay.isConnected()).toBe(true);
      ws.close();
    });

    it("invalid message (fails parseRelayMessage): ignored", async () => {
      const ws = await connectWs(port, "/ws/relay", "relay-token-123");

      // Valid JSON but missing required fields
      ws.send(JSON.stringify({ type: "credential_request" }));
      await new Promise((r) => setTimeout(r, 50));

      expect(relay.isConnected()).toBe(true);
      ws.close();
    });
  });

  // ── send() ────────────────────────────────────────────────────────

  describe("send()", () => {
    it("delivers message to connected client", async () => {
      const ws = await connectWs(port, "/ws/relay", "relay-token-123");

      const msgPromise = waitForMessage(ws);

      const msg = createRelayMessage("credential_response", {
        key: "API_KEY",
        value: "secret-123",
        source: "env",
      });

      relay.send(msg);

      const received = await msgPromise;
      expect(received.type).toBe("credential_response");
      expect((received as { key: string }).key).toBe("API_KEY");
      expect((received as { value: string }).value).toBe("secret-123");

      ws.close();
    });

    it("throws when not connected", () => {
      const msg = createRelayMessage("credential_response", {
        key: "API_KEY",
        value: "secret",
      });

      expect(() => relay.send(msg)).toThrow("Relay not connected");
    });
  });

  // ── request() ─────────────────────────────────────────────────────

  describe("request()", () => {
    it("sends message and resolves when correlated response arrives", async () => {
      const ws = await connectWs(port, "/ws/relay", "relay-token-123");

      // Client responds with matching id
      ws.on("message", (data) => {
        const req = JSON.parse(data.toString());
        const response = createRelayMessage("credential_response", {
          key: "API_KEY",
          value: "resolved-value",
          source: "env",
        });
        // Use the same id for correlation
        ws.send(JSON.stringify({ ...response, id: req.id }));
      });

      const reqMsg = createRelayMessage("credential_request", {
        key: "API_KEY",
        agentId: "agent-1",
        role: "dev",
        sessionId: "sess-1",
        declaredCredentials: ["API_KEY"],
      });

      const result = await relay.request(reqMsg);
      expect(result.type).toBe("credential_response");
      expect((result as { value: string }).value).toBe("resolved-value");

      ws.close();
    });

    it("rejects after timeout", async () => {
      const ws = await connectWs(port, "/ws/relay", "relay-token-123");

      // Client doesn't respond
      const reqMsg = createRelayMessage("credential_request", {
        key: "API_KEY",
        agentId: "agent-1",
        role: "dev",
        sessionId: "sess-1",
        declaredCredentials: [],
      });

      await expect(relay.request(reqMsg, 100)).rejects.toThrow("Relay request timed out after 100ms");

      ws.close();
    });

    it("rejects immediately when not connected", async () => {
      const reqMsg = createRelayMessage("credential_request", {
        key: "API_KEY",
        agentId: "agent-1",
        role: "dev",
        sessionId: "sess-1",
        declaredCredentials: [],
      });

      await expect(relay.request(reqMsg)).rejects.toThrow("Relay not connected");
    });

    it("response routed to request() even if handler registered for type", async () => {
      const ws = await connectWs(port, "/ws/relay", "relay-token-123");

      const handlerCalls: RelayMessage[] = [];
      relay.registerHandler("credential_response", (msg) => {
        handlerCalls.push(msg);
      });

      // Client responds with matching id
      ws.on("message", (data) => {
        const req = JSON.parse(data.toString());
        const response = createRelayMessage("credential_response", {
          key: "API_KEY",
          value: "val",
        });
        ws.send(JSON.stringify({ ...response, id: req.id }));
      });

      const reqMsg = createRelayMessage("credential_request", {
        key: "API_KEY",
        agentId: "agent-1",
        role: "dev",
        sessionId: "sess-1",
        declaredCredentials: [],
      });

      const result = await relay.request(reqMsg);
      expect(result.type).toBe("credential_response");
      // Handler should NOT have been called — request() takes priority
      expect(handlerCalls).toHaveLength(0);

      ws.close();
    });

    it("multiple concurrent requests resolved independently", async () => {
      const ws = await connectWs(port, "/ws/relay", "relay-token-123");

      // Client responds to each request with its own id
      ws.on("message", (data) => {
        const req = JSON.parse(data.toString());
        const response = createRelayMessage("credential_response", {
          key: req.key,
          value: `val-for-${req.key}`,
        });
        ws.send(JSON.stringify({ ...response, id: req.id }));
      });

      const req1 = createRelayMessage("credential_request", {
        key: "KEY_A",
        agentId: "agent-1",
        role: "dev",
        sessionId: "sess-1",
        declaredCredentials: [],
      });

      const req2 = createRelayMessage("credential_request", {
        key: "KEY_B",
        agentId: "agent-1",
        role: "dev",
        sessionId: "sess-1",
        declaredCredentials: [],
      });

      const [result1, result2] = await Promise.all([
        relay.request(req1),
        relay.request(req2),
      ]);

      expect((result1 as { value: string }).value).toBe("val-for-KEY_A");
      expect((result2 as { value: string }).value).toBe("val-for-KEY_B");

      ws.close();
    });
  });

  // ── shutdown() ────────────────────────────────────────────────────

  describe("shutdown()", () => {
    it("closes WebSocket connection", async () => {
      const ws = await connectWs(port, "/ws/relay", "relay-token-123");
      expect(relay.isConnected()).toBe(true);

      await relay.shutdown();

      await new Promise((r) => setTimeout(r, 50));
      expect(relay.isConnected()).toBe(false);
      expect(ws.readyState).toBe(WebSocket.CLOSED);
    });

    it("rejects pending requests", async () => {
      const ws = await connectWs(port, "/ws/relay", "relay-token-123");

      const reqMsg = createRelayMessage("credential_request", {
        key: "API_KEY",
        agentId: "agent-1",
        role: "dev",
        sessionId: "sess-1",
        declaredCredentials: [],
      });

      const promise = relay.request(reqMsg);

      // Give time for the request to be sent
      await new Promise((r) => setTimeout(r, 50));

      // Attach rejection handler before shutdown to avoid unhandled rejection
      const rejection = expect(promise).rejects.toThrow("Relay shutting down");
      await relay.shutdown();
      await rejection;

      ws.close();
    });

    it("isConnected() returns false after shutdown", async () => {
      const ws = await connectWs(port, "/ws/relay", "relay-token-123");
      expect(relay.isConnected()).toBe(true);

      await relay.shutdown();
      expect(relay.isConnected()).toBe(false);

      ws.close();
    });
  });
});
