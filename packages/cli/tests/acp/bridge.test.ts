import { describe, expect, it, afterEach, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { AcpBridge, extractCwdFromBody, parseRequestBody } from "../../src/acp/bridge.js";

// ── Helpers ─────────────────────────────────────────────────────────────

/** Create a mock ACP agent server that echoes requests back. */
function createMockAgent(port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);

      if (req.method === "GET" && url.pathname === "/") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", mode: "acp" }));
        return;
      }

      if (req.method === "POST") {
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          const body = Buffer.concat(chunks).toString();
          res.writeHead(200, {
            "Content-Type": "application/json",
            "x-echo-path": url.pathname,
          });
          res.end(JSON.stringify({ echo: body, path: url.pathname }));
        });
        return;
      }

      if (req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ path: url.pathname, method: "GET" }));
        return;
      }

      res.writeHead(404);
      res.end();
    });

    server.on("error", reject);
    server.listen(port, () => {
      server.removeListener("error", reject);
      resolve(server);
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function httpGet(port: number, path: string): Promise<{ status: number; body: string; headers: Record<string, string | string[] | undefined> }> {
  const { request } = await import("node:http");
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "localhost", port, path, method: "GET" }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString(),
          headers: res.headers,
        });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function httpPost(
  port: number,
  path: string,
  body: string,
  headers?: Record<string, string>,
): Promise<{ status: number; body: string; headers: Record<string, string | string[] | undefined> }> {
  const { request } = await import("node:http");
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: "localhost",
        port,
        path,
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString(),
            headers: res.headers,
          });
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── Unique port allocation to prevent test collisions ─────────────────

let portCounter = 14200;
function nextPort(): number {
  return portCounter++;
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("AcpBridge", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    // Clean up in reverse order
    for (const cleanup of cleanups.reverse()) {
      await cleanup();
    }
    cleanups.length = 0;
  });

  describe("start()", () => {
    it("starts and accepts connections on host port", async () => {
      const hostPort = nextPort();
      const containerPort = nextPort();

      const bridge = new AcpBridge({
        hostPort,
        containerHost: "localhost",
        containerPort,
      });
      await bridge.start();
      cleanups.push(() => bridge.stop());

      const res = await httpGet(hostPort, "/health");
      expect(res.status).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ status: "ok" });
    });

    it("is idempotent — calling start twice does not throw", async () => {
      const hostPort = nextPort();
      const containerPort = nextPort();

      const bridge = new AcpBridge({
        hostPort,
        containerHost: "localhost",
        containerPort,
      });
      await bridge.start();
      cleanups.push(() => bridge.stop());

      // Second call should be a no-op
      await bridge.start();

      const res = await httpGet(hostPort, "/health");
      expect(res.status).toBe(200);
    });
  });

  describe("agent not connected", () => {
    it("returns 503 when agent is not connected", async () => {
      const hostPort = nextPort();
      const containerPort = nextPort();

      const bridge = new AcpBridge({
        hostPort,
        containerHost: "localhost",
        containerPort,
      });
      await bridge.start();
      cleanups.push(() => bridge.stop());

      const res = await httpPost(hostPort, "/", '{"command":"list"}');
      expect(res.status).toBe(503);
      expect(JSON.parse(res.body)).toEqual({ error: "Agent not connected" });
    });
  });

  describe("connectToAgent()", () => {
    it("succeeds when agent is reachable", async () => {
      const hostPort = nextPort();
      const containerPort = nextPort();

      const agent = await createMockAgent(containerPort);
      cleanups.push(() => closeServer(agent));

      const bridge = new AcpBridge({
        hostPort,
        containerHost: "localhost",
        containerPort,
        connectRetries: 0,
      });
      await bridge.start();
      cleanups.push(() => bridge.stop());

      await expect(bridge.connectToAgent()).resolves.toBeUndefined();
    });

    it("fails when agent is not reachable", async () => {
      const hostPort = nextPort();
      const containerPort = nextPort(); // Nothing listening here

      const bridge = new AcpBridge({
        hostPort,
        containerHost: "localhost",
        containerPort,
        connectRetries: 0,
        connectRetryDelayMs: 10,
      });
      await bridge.start();
      cleanups.push(() => bridge.stop());

      await expect(bridge.connectToAgent()).rejects.toThrow(/Failed to connect to ACP agent/);
    });

    it("retries and succeeds when agent becomes reachable", async () => {
      const hostPort = nextPort();
      const containerPort = nextPort();

      const bridge = new AcpBridge({
        hostPort,
        containerHost: "localhost",
        containerPort,
        connectRetries: 5,
        connectRetryDelayMs: 50,
      });
      await bridge.start();
      cleanups.push(() => bridge.stop());

      // Start the agent after a brief delay
      let agent: Server | undefined;
      setTimeout(async () => {
        agent = await createMockAgent(containerPort);
      }, 100);

      await expect(bridge.connectToAgent()).resolves.toBeUndefined();

      if (agent) {
        cleanups.push(() => closeServer(agent!));
      }
    });
  });

  describe("relay", () => {
    it("relays POST requests host -> container -> host", async () => {
      const hostPort = nextPort();
      const containerPort = nextPort();

      const agent = await createMockAgent(containerPort);
      cleanups.push(() => closeServer(agent));

      const bridge = new AcpBridge({
        hostPort,
        containerHost: "localhost",
        containerPort,
        connectRetries: 0,
      });
      await bridge.start();
      cleanups.push(() => bridge.stop());
      await bridge.connectToAgent();

      const res = await httpPost(hostPort, "/", '{"command":"list"}');
      expect(res.status).toBe(200);

      const body = JSON.parse(res.body);
      expect(body.echo).toBe('{"command":"list"}');
      expect(body.path).toBe("/");
    });

    it("relays GET requests and preserves path", async () => {
      const hostPort = nextPort();
      const containerPort = nextPort();

      const agent = await createMockAgent(containerPort);
      cleanups.push(() => closeServer(agent));

      const bridge = new AcpBridge({
        hostPort,
        containerHost: "localhost",
        containerPort,
        connectRetries: 0,
      });
      await bridge.start();
      cleanups.push(() => bridge.stop());
      await bridge.connectToAgent();

      const res = await httpGet(hostPort, "/some/path");
      expect(res.status).toBe(200);

      const body = JSON.parse(res.body);
      expect(body.path).toBe("/some/path");
      expect(body.method).toBe("GET");
    });

    it("relays response headers from agent to client", async () => {
      const hostPort = nextPort();
      const containerPort = nextPort();

      const agent = await createMockAgent(containerPort);
      cleanups.push(() => closeServer(agent));

      const bridge = new AcpBridge({
        hostPort,
        containerHost: "localhost",
        containerPort,
        connectRetries: 0,
      });
      await bridge.start();
      cleanups.push(() => bridge.stop());
      await bridge.connectToAgent();

      const res = await httpPost(hostPort, "/test-path", '{"data":"value"}');
      expect(res.status).toBe(200);
      expect(res.headers["x-echo-path"]).toBe("/test-path");
    });
  });

  describe("events", () => {
    it("emits onClientConnect on first client request", async () => {
      const hostPort = nextPort();
      const containerPort = nextPort();

      const agent = await createMockAgent(containerPort);
      cleanups.push(() => closeServer(agent));

      const bridge = new AcpBridge({
        hostPort,
        containerHost: "localhost",
        containerPort,
        connectRetries: 0,
      });

      const connectFn = vi.fn();
      bridge.onClientConnect = connectFn;

      await bridge.start();
      cleanups.push(() => bridge.stop());
      await bridge.connectToAgent();

      // First request triggers connect
      await httpPost(hostPort, "/", '{"command":"test"}');
      expect(connectFn).toHaveBeenCalledTimes(1);

      // Second request does not trigger another connect
      await httpPost(hostPort, "/", '{"command":"test2"}');
      expect(connectFn).toHaveBeenCalledTimes(1);
    });

    it("emits onClientDisconnect after idle timeout", async () => {
      const hostPort = nextPort();
      const containerPort = nextPort();

      const agent = await createMockAgent(containerPort);
      cleanups.push(() => closeServer(agent));

      const bridge = new AcpBridge({
        hostPort,
        containerHost: "localhost",
        containerPort,
        connectRetries: 0,
        idleTimeoutMs: 50, // Very short for testing
      });

      const disconnectFn = vi.fn();
      bridge.onClientDisconnect = disconnectFn;

      await bridge.start();
      cleanups.push(() => bridge.stop());
      await bridge.connectToAgent();

      await httpPost(hostPort, "/", '{"command":"test"}');
      expect(disconnectFn).toHaveBeenCalledTimes(0);

      // Wait for idle timeout
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(disconnectFn).toHaveBeenCalledTimes(1);
    });

    it("emits onAgentError when agent is unreachable during relay", async () => {
      const hostPort = nextPort();
      const containerPort = nextPort();

      // Start agent, connect, then kill it
      const agent = await createMockAgent(containerPort);

      const bridge = new AcpBridge({
        hostPort,
        containerHost: "localhost",
        containerPort,
        connectRetries: 0,
      });

      const errorFn = vi.fn();
      bridge.onAgentError = errorFn;

      await bridge.start();
      cleanups.push(() => bridge.stop());
      await bridge.connectToAgent();

      // Kill the agent
      await closeServer(agent);

      // Try to relay — should get 502 and onAgentError
      const res = await httpPost(hostPort, "/", '{"command":"test"}');
      expect(res.status).toBe(502);
      expect(JSON.parse(res.body)).toEqual({ error: "Bad Gateway — agent unreachable" });
      expect(errorFn).toHaveBeenCalledTimes(1);
      expect(errorFn.mock.calls[0]![0]).toBeInstanceOf(Error);
    });
  });

  describe("stop()", () => {
    it("tears down cleanly", async () => {
      const hostPort = nextPort();
      const containerPort = nextPort();

      const bridge = new AcpBridge({
        hostPort,
        containerHost: "localhost",
        containerPort,
      });
      await bridge.start();
      await bridge.stop();

      // After stop, connections should be refused
      await expect(httpGet(hostPort, "/health")).rejects.toThrow();
    });

    it("is idempotent — calling stop twice does not throw", async () => {
      const hostPort = nextPort();
      const containerPort = nextPort();

      const bridge = new AcpBridge({
        hostPort,
        containerHost: "localhost",
        containerPort,
      });
      await bridge.start();
      await bridge.stop();
      await expect(bridge.stop()).resolves.toBeUndefined();
    });
  });

  describe("onSessionNew (deferred agent start)", () => {
    it("calls onSessionNew with cwd from POST body when agent not connected", async () => {
      const hostPort = nextPort();
      const containerPort = nextPort();

      const agent = await createMockAgent(containerPort);
      cleanups.push(() => closeServer(agent));

      const bridge = new AcpBridge({
        hostPort,
        containerHost: "localhost",
        containerPort,
        connectRetries: 0,
      });

      let receivedCwd: string | undefined;
      bridge.onSessionNew = async (cwd: string) => {
        receivedCwd = cwd;
        // Simulate starting agent and connecting
        await bridge.connectToAgent();
      };

      await bridge.start();
      cleanups.push(() => bridge.stop());

      // Send POST — agent not connected yet, so onSessionNew should be called
      const res = await httpPost(hostPort, "/", JSON.stringify({ params: { cwd: "/projects/myapp" } }));

      expect(res.status).toBe(200);
      expect(receivedCwd).toBe("/projects/myapp");
    });

    it("returns stub response for initialize (no cwd) without starting agent", async () => {
      const hostPort = nextPort();
      const containerPort = nextPort();

      const bridge = new AcpBridge({
        hostPort,
        containerHost: "localhost",
        containerPort,
        connectRetries: 0,
      });

      let sessionNewCalled = false;
      bridge.onSessionNew = async () => {
        sessionNewCalled = true;
      };

      await bridge.start();
      cleanups.push(() => bridge.stop());

      const res = await httpPost(hostPort, "/", JSON.stringify({
        jsonrpc: "2.0",
        method: "initialize",
        id: 1,
        params: { protocolVersion: "2025-03-26", capabilities: {} },
      }));

      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.jsonrpc).toBe("2.0");
      expect(body.id).toBe(1);
      expect(body.result.protocolVersion).toBe("2025-03-26");
      expect(body.result.serverInfo.name).toBe("clawmasons");
      // onSessionNew should NOT have been called
      expect(sessionNewCalled).toBe(false);
    });

    it("returns error stub for non-initialize pre-session message without cwd", async () => {
      const hostPort = nextPort();
      const containerPort = nextPort();

      const bridge = new AcpBridge({
        hostPort,
        containerHost: "localhost",
        containerPort,
        connectRetries: 0,
      });

      bridge.onSessionNew = async () => {
        // Should not be called
      };

      await bridge.start();
      cleanups.push(() => bridge.stop());

      const res = await httpPost(hostPort, "/", JSON.stringify({
        jsonrpc: "2.0",
        method: "session/prompt",
        id: 5,
        params: { text: "hello" },
      }));

      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.jsonrpc).toBe("2.0");
      expect(body.id).toBe(5);
      expect(body.error.code).toBe(-32000);
      expect(body.error.message).toContain("session/new");
    });

    it("relays buffered request to agent after onSessionNew resolves", async () => {
      const hostPort = nextPort();
      const containerPort = nextPort();

      const agent = await createMockAgent(containerPort);
      cleanups.push(() => closeServer(agent));

      const bridge = new AcpBridge({
        hostPort,
        containerHost: "localhost",
        containerPort,
        connectRetries: 0,
      });

      bridge.onSessionNew = async () => {
        await bridge.connectToAgent();
      };

      await bridge.start();
      cleanups.push(() => bridge.stop());

      const body = JSON.stringify({ method: "initialize", params: { cwd: "/test" } });
      const res = await httpPost(hostPort, "/", body);

      expect(res.status).toBe(200);
      // The mock agent echoes the body back
      const parsed = JSON.parse(res.body);
      expect(parsed.echo).toBe(body);
    });

    it("returns 500 when onSessionNew callback fails", async () => {
      const hostPort = nextPort();
      const containerPort = nextPort();

      const bridge = new AcpBridge({
        hostPort,
        containerHost: "localhost",
        containerPort,
      });

      bridge.onSessionNew = async () => {
        throw new Error("Agent container failed to start");
      };

      await bridge.start();
      cleanups.push(() => bridge.stop());

      const res = await httpPost(hostPort, "/", JSON.stringify({ params: { cwd: "/test" } }));

      expect(res.status).toBe(500);
      const parsed = JSON.parse(res.body);
      expect(parsed.error).toContain("Session startup failed");
    });

    it("returns 503 when no onSessionNew and agent not connected", async () => {
      const hostPort = nextPort();
      const containerPort = nextPort();

      const bridge = new AcpBridge({
        hostPort,
        containerHost: "localhost",
        containerPort,
      });

      // No onSessionNew set — old behavior
      await bridge.start();
      cleanups.push(() => bridge.stop());

      const res = await httpPost(hostPort, "/", '{"command":"list"}');
      expect(res.status).toBe(503);
      expect(JSON.parse(res.body)).toEqual({ error: "Agent not connected" });
    });

    it("returns 503 when concurrent session starts are attempted", async () => {
      const hostPort = nextPort();
      const containerPort = nextPort();

      const agent = await createMockAgent(containerPort);
      cleanups.push(() => closeServer(agent));

      const bridge = new AcpBridge({
        hostPort,
        containerHost: "localhost",
        containerPort,
        connectRetries: 0,
      });

      // Slow onSessionNew to create a window for concurrent requests
      bridge.onSessionNew = async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        await bridge.connectToAgent();
      };

      await bridge.start();
      cleanups.push(() => bridge.stop());

      // Send two concurrent session/new requests (both have cwd)
      const [res1, res2] = await Promise.all([
        httpPost(hostPort, "/", JSON.stringify({ method: "session/new", params: { cwd: "/test1" } })),
        httpPost(hostPort, "/", JSON.stringify({ method: "session/new", params: { cwd: "/test2" } })),
      ]);

      // One should succeed (200) and the other should get 503
      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 503]);
    });
  });

  describe("resetForNewSession()", () => {
    it("allows new onSessionNew after reset", async () => {
      const hostPort = nextPort();
      const containerPort = nextPort();

      const agent = await createMockAgent(containerPort);
      cleanups.push(() => closeServer(agent));

      const bridge = new AcpBridge({
        hostPort,
        containerHost: "localhost",
        containerPort,
        connectRetries: 0,
      });

      let sessionNewCallCount = 0;
      bridge.onSessionNew = async () => {
        sessionNewCallCount++;
        await bridge.connectToAgent();
      };

      await bridge.start();
      cleanups.push(() => bridge.stop());

      // First session
      await httpPost(hostPort, "/", JSON.stringify({ params: { cwd: "/test1" } }));
      expect(sessionNewCallCount).toBe(1);

      // Second request should relay directly (agent already connected)
      await httpPost(hostPort, "/", JSON.stringify({ data: "more" }));
      expect(sessionNewCallCount).toBe(1); // Not called again

      // Reset for new session
      bridge.resetForNewSession();

      // Third request triggers onSessionNew again
      await httpPost(hostPort, "/", JSON.stringify({ params: { cwd: "/test2" } }));
      expect(sessionNewCallCount).toBe(2);
    });

    it("server remains running after reset", async () => {
      const hostPort = nextPort();
      const containerPort = nextPort();

      const bridge = new AcpBridge({
        hostPort,
        containerHost: "localhost",
        containerPort,
      });
      await bridge.start();
      cleanups.push(() => bridge.stop());

      bridge.resetForNewSession();

      // Health endpoint should still work
      const res = await httpGet(hostPort, "/health");
      expect(res.status).toBe(200);
    });
  });
});

// ── parseRequestBody ────────────────────────────────────────────────────

describe("parseRequestBody", () => {
  it("extracts cwd and method from JSON-RPC session/new", () => {
    const body = Buffer.from(JSON.stringify({
      jsonrpc: "2.0", method: "session/new", id: 2,
      params: { cwd: "/projects/app", mcpServers: [] },
    }));
    const result = parseRequestBody(body);
    expect(result.cwd).toBe("/projects/app");
    expect(result.method).toBe("session/new");
    expect(result.id).toBe(2);
  });

  it("returns null cwd for initialize (no cwd field)", () => {
    const body = Buffer.from(JSON.stringify({
      jsonrpc: "2.0", method: "initialize", id: 1,
      params: { protocolVersion: "2025-03-26", capabilities: {} },
    }));
    const result = parseRequestBody(body);
    expect(result.cwd).toBeNull();
    expect(result.method).toBe("initialize");
    expect(result.id).toBe(1);
  });

  it("returns null cwd for invalid JSON", () => {
    const body = Buffer.from("not json");
    const result = parseRequestBody(body);
    expect(result.cwd).toBeNull();
    expect(result.method).toBeNull();
    expect(result.id).toBeNull();
  });

  it("extracts top-level cwd", () => {
    const body = Buffer.from(JSON.stringify({ cwd: "/test" }));
    const result = parseRequestBody(body);
    expect(result.cwd).toBe("/test");
  });

  it("returns null cwd for empty string", () => {
    const body = Buffer.from(JSON.stringify({ params: { cwd: "" } }));
    const result = parseRequestBody(body);
    expect(result.cwd).toBeNull();
  });
});

// ── extractCwdFromBody (deprecated) ─────────────────────────────────────

describe("extractCwdFromBody", () => {
  it("extracts cwd from params.cwd (JSON-RPC style)", () => {
    const body = Buffer.from(JSON.stringify({ method: "initialize", params: { cwd: "/projects/app" } }));
    expect(extractCwdFromBody(body)).toBe("/projects/app");
  });

  it("extracts cwd from top-level cwd field", () => {
    const body = Buffer.from(JSON.stringify({ cwd: "/projects/app" }));
    expect(extractCwdFromBody(body)).toBe("/projects/app");
  });

  it("prefers params.cwd over top-level cwd", () => {
    const body = Buffer.from(JSON.stringify({ cwd: "/top-level", params: { cwd: "/params-level" } }));
    expect(extractCwdFromBody(body)).toBe("/params-level");
  });

  it("returns process.cwd() for empty cwd string", () => {
    const body = Buffer.from(JSON.stringify({ params: { cwd: "" } }));
    expect(extractCwdFromBody(body)).toBe(process.cwd());
  });

  it("returns process.cwd() for non-string cwd", () => {
    const body = Buffer.from(JSON.stringify({ params: { cwd: 42 } }));
    expect(extractCwdFromBody(body)).toBe(process.cwd());
  });

  it("returns process.cwd() for invalid JSON", () => {
    const body = Buffer.from("not json at all");
    expect(extractCwdFromBody(body)).toBe(process.cwd());
  });

  it("returns process.cwd() when no cwd field present", () => {
    const body = Buffer.from(JSON.stringify({ method: "initialize", params: {} }));
    expect(extractCwdFromBody(body)).toBe(process.cwd());
  });

  it("returns process.cwd() for empty body", () => {
    const body = Buffer.from("");
    expect(extractCwdFromBody(body)).toBe(process.cwd());
  });
});
