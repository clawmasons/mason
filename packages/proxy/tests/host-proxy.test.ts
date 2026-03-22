import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import { RelayServer } from "../src/relay/server.js";
import { HostProxy } from "../src/host-proxy.js";
import { createRelayMessage, type RelayMessage } from "../src/relay/messages.js";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ── Mock the approval dialog (osascript not available in tests) ─────
vi.mock("../src/approvals/dialog.js", () => ({
  showApprovalDialog: vi.fn().mockResolvedValue(true),
}));

import { showApprovalDialog } from "../src/approvals/dialog.js";
const mockDialog = vi.mocked(showApprovalDialog);

// ── Test port management ────────────────────────────────────────────
let nextPort = 19800;
function getPort(): number {
  return nextPort++;
}

// ── HostProxy Tests ─────────────────────────────────────────────────

describe("HostProxy", () => {
  let relay: RelayServer;
  let httpServer: HttpServer;
  let port: number;
  let proxy: HostProxy;
  let tmpDir: string;
  let auditFilePath: string;

  beforeEach(async () => {
    port = getPort();
    relay = new RelayServer({
      token: "test-token",
      defaultTimeoutMs: 5000,
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

    // Temp directory for audit file
    tmpDir = mkdtempSync(join(tmpdir(), "host-proxy-test-"));
    auditFilePath = join(tmpDir, "audit.jsonl");

    proxy = new HostProxy({
      relayUrl: `ws://localhost:${port}/ws/relay`,
      token: "test-token",
      auditFilePath,
    });
  });

  afterEach(async () => {
    await proxy.stop();
    await relay.shutdown();
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  // ── Lifecycle ─────────────────────────────────────────────────────

  describe("Lifecycle", () => {
    it("start() connects to relay server", async () => {
      await proxy.start();
      expect(proxy.isConnected()).toBe(true);
      expect(relay.isConnected()).toBe(true);
    });

    it("stop() disconnects from relay server", async () => {
      await proxy.start();
      expect(proxy.isConnected()).toBe(true);

      await proxy.stop();
      expect(proxy.isConnected()).toBe(false);

      // Give relay server time to notice the disconnect
      await new Promise((r) => setTimeout(r, 50));
      expect(relay.isConnected()).toBe(false);
    });

    it("stop() is idempotent — calling twice does not throw", async () => {
      await proxy.start();
      await proxy.stop();
      await expect(proxy.stop()).resolves.toBeUndefined();
    });

    it("stop() before start() is a no-op", async () => {
      await expect(proxy.stop()).resolves.toBeUndefined();
    });

    it("isConnected() returns false before start", () => {
      expect(proxy.isConnected()).toBe(false);
    });

    it("isConnected() returns true after start, false after stop", async () => {
      expect(proxy.isConnected()).toBe(false);
      await proxy.start();
      expect(proxy.isConnected()).toBe(true);
      await proxy.stop();
      expect(proxy.isConnected()).toBe(false);
    });
  });

  // ── Handler Registration ──────────────────────────────────────────

  describe("Handler registration", () => {
    it("handles credential_request messages", async () => {
      // Set the env var so CredentialResolver can find it
      process.env["TEST_CRED_KEY_HP"] = "test-value-hp";

      await proxy.start();

      const credReq = createRelayMessage("credential_request", {
        key: "TEST_CRED_KEY_HP",
        agentId: "agent-1",
        role: "dev",
        sessionId: "sess-1",
        declaredCredentials: ["TEST_CRED_KEY_HP"],
      });

      const received: RelayMessage[] = [];
      relay.registerHandler("credential_response", (msg) => {
        received.push(msg);
      });

      relay.send(credReq);

      await vi.waitFor(() => {
        expect(received).toHaveLength(1);
      }, { timeout: 2000 });

      const response = received[0] as Record<string, unknown>;
      expect(response.id).toBe(credReq.id);
      expect(response.type).toBe("credential_response");
      expect(response.key).toBe("TEST_CRED_KEY_HP");
      expect(response.value).toBe("test-value-hp");
      expect(response.source).toBe("env");

      delete process.env["TEST_CRED_KEY_HP"];
    });

    it("handles approval_request messages", async () => {
      mockDialog.mockResolvedValue(true);
      await proxy.start();

      const approvalReq = createRelayMessage("approval_request", {
        agent_name: "researcher",
        role_name: "dev",
        app_name: "@acme/app-github",
        tool_name: "github_delete_repo",
        arguments: '{"owner":"acme"}',
        ttl_seconds: 300,
      });

      const received: RelayMessage[] = [];
      relay.registerHandler("approval_response", (msg) => {
        received.push(msg);
      });

      relay.send(approvalReq);

      await vi.waitFor(() => {
        expect(received).toHaveLength(1);
      }, { timeout: 2000 });

      const response = received[0] as Record<string, unknown>;
      expect(response.id).toBe(approvalReq.id);
      expect(response.type).toBe("approval_response");
      expect(response.status).toBe("approved");
    });

    it("handles audit_event messages by writing to JSONL file", async () => {
      await proxy.start();

      const auditEvent = createRelayMessage("audit_event", {
        agent_name: "researcher",
        role_name: "dev",
        app_name: "@acme/app-github",
        tool_name: "github_list_repos",
        status: "success" as const,
        duration_ms: 150,
        timestamp: "2026-03-21T10:00:00.000Z",
      });

      relay.send(auditEvent);

      // Wait for the audit write to occur
      await vi.waitFor(() => {
        const content = readFileSync(auditFilePath, "utf-8");
        expect(content.length).toBeGreaterThan(0);
      }, { timeout: 2000 });

      const content = readFileSync(auditFilePath, "utf-8");
      const lines = content.trim().split("\n");
      expect(lines).toHaveLength(1);

      const parsed = JSON.parse(lines[0]);
      expect(parsed.type).toBe("audit_event");
      expect(parsed.tool_name).toBe("github_list_repos");
      expect(parsed.status).toBe("success");
    });
  });

  // ── Does not listen on any port ───────────────────────────────────

  describe("No port listening", () => {
    it("host proxy does not create an HTTP server", async () => {
      await proxy.start();

      // The only server listening is our test httpServer on `port`.
      // Attempt to connect to a different port should fail,
      // confirming the host proxy didn't start its own server.
      // We verify by checking isConnected (client-only behavior).
      expect(proxy.isConnected()).toBe(true);

      // The host proxy object has no server property
      expect((proxy as unknown as Record<string, unknown>)["httpServer"]).toBeUndefined();
      expect((proxy as unknown as Record<string, unknown>)["server"]).toBeUndefined();
    });
  });
});
