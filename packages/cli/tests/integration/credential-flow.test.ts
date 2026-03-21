/**
 * Integration test for the credential flow pipeline.
 *
 * Tests the full flow: proxy + relay client + credential service (SDK mode, in-process)
 * -> connect-agent -> credential_request -> credential resolved via relay.
 *
 * This exercises the same code paths as a Docker deployment but without
 * containers, using the proxy's Streamable HTTP transport, the RelayClient,
 * and the CredentialRelayHandler.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  ProxyServer,
  ToolRouter,
  UpstreamManager,
  RelayClient,
  CredentialService,
  CredentialRelayHandler,
} from "@clawmasons/proxy";

// ── Test port management ────────────────────────────────────────────

let nextPort = 19600;
function getPort(): number {
  return nextPort++;
}

// ── Integration Tests ──────────────────────────────────────────────

describe("credential flow integration", () => {
  const PROXY_TOKEN = "test-proxy-token-abc";
  const RELAY_TOKEN = "test-relay-token-xyz";
  const envKeysToClean: string[] = [];

  let port: number;
  let proxyUrl: string;
  let proxy: ProxyServer;
  let credentialService: CredentialService;
  let relayClient: RelayClient;

  // MCP SDK client (initialized once in beforeAll)
  let mcpClient: Client;

  function setEnv(key: string, value: string): void {
    process.env[key] = value;
    envKeysToClean.push(key);
  }

  beforeAll(async () => {
    port = getPort();
    proxyUrl = `http://localhost:${port}`;

    // Set up credential in process env
    setEnv("TEST_TOKEN", "my-secret-test-token-value");

    // Create credential service (SDK mode, in-memory DB)
    credentialService = new CredentialService({
      dbPath: ":memory:",
      envFilePath: "/nonexistent/.env",
      keychainService: "test-integration",
    });

    // Create a minimal proxy with relay enabled
    const router = new ToolRouter(new Map(), new Map());
    const upstream = new UpstreamManager([]);

    proxy = new ProxyServer({
      port,
      transport: "streamable-http",
      router,
      upstream,
      authToken: PROXY_TOKEN,
      relayToken: RELAY_TOKEN,
      credentialRequestTimeoutMs: 5000,
      declaredCredentials: ["TEST_TOKEN"],
      agentName: "mcp-test",
      roleName: "mcp-test-role",
      riskLevel: "LOW",
    });

    await proxy.start();

    // Connect relay client (simulating the host proxy)
    relayClient = new RelayClient({
      url: `ws://localhost:${port}/ws/relay`,
      token: RELAY_TOKEN,
    });

    // Register credential handler on relay client
    const credHandler = new CredentialRelayHandler(relayClient, credentialService);
    credHandler.register();

    await relayClient.connect();

    // Initialize MCP SDK client
    mcpClient = new Client({ name: "test-client", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(
      new URL(`${proxyUrl}/mcp`),
      {
        requestInit: {
          headers: { Authorization: `Bearer ${PROXY_TOKEN}` },
        },
      },
    );
    await mcpClient.connect(transport);
  });

  afterAll(async () => {
    try {
      await mcpClient.close();
    } catch {
      // best-effort
    }
    relayClient.disconnect();
    await proxy.stop();
    credentialService.close();

    for (const key of envKeysToClean) {
      process.env[key] = undefined;
    }
    envKeysToClean.length = 0;
  });

  // ── Connect-Agent Tests ─────────────────────────────────────────

  it("connect-agent returns session token", async () => {
    const res = await fetch(`${proxyUrl}/connect-agent`, {
      method: "POST",
      headers: { Authorization: `Bearer ${PROXY_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { sessionToken: string; sessionId: string };
    expect(body.sessionToken).toBeDefined();
    expect(body.sessionId).toBeDefined();
    expect(typeof body.sessionToken).toBe("string");
    expect(body.sessionToken.length).toBeGreaterThan(0);
  });

  it("connect-agent rejects invalid token", async () => {
    const res = await fetch(`${proxyUrl}/connect-agent`, {
      method: "POST",
      headers: { Authorization: "Bearer wrong-token" },
    });

    expect(res.status).toBe(401);
  });

  // ── MCP Tool Tests ──────────────────────────────────────────────

  it("credential_request tool is listed in available tools", async () => {
    const { tools } = await mcpClient.listTools();

    const credTool = tools.find((t) => t.name === "credential_request");
    expect(credTool).toBeDefined();
    expect(credTool!.description).toContain("credential");
  });

  it("full credential flow: connect -> request credential -> receive value", async () => {
    // 1. Connect agent to get session token
    const connectRes = await fetch(`${proxyUrl}/connect-agent`, {
      method: "POST",
      headers: { Authorization: `Bearer ${PROXY_TOKEN}` },
    });
    const { sessionToken } = await connectRes.json() as { sessionToken: string };

    // 2. Call credential_request tool via MCP SDK client
    const result = await mcpClient.callTool({
      name: "credential_request",
      arguments: {
        key: "TEST_TOKEN",
        session_token: sessionToken,
      },
    });

    // 3. Verify credential was received
    expect(result.isError).toBeFalsy();
    expect(result.content).toHaveLength(1);

    const content = result.content as Array<{ type: string; text: string }>;
    const textContent = content[0];
    const parsed = JSON.parse(textContent.text) as { key: string; value: string };
    expect(parsed.key).toBe("TEST_TOKEN");
    expect(parsed.value).toBe("my-secret-test-token-value");
  });

  it("credential_request denies undeclared credentials", async () => {
    // Connect agent
    const connectRes = await fetch(`${proxyUrl}/connect-agent`, {
      method: "POST",
      headers: { Authorization: `Bearer ${PROXY_TOKEN}` },
    });
    const { sessionToken } = await connectRes.json() as { sessionToken: string };

    // Request a credential not in declaredCredentials
    const result = await mcpClient.callTool({
      name: "credential_request",
      arguments: {
        key: "UNDECLARED_KEY",
        session_token: sessionToken,
      },
    });

    // Should be an error
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const textContent = content[0];
    expect(textContent.text).toContain("Credential error");
  });

  it("credential_request rejects invalid session token", async () => {
    const result = await mcpClient.callTool({
      name: "credential_request",
      arguments: {
        key: "TEST_TOKEN",
        session_token: "invalid-session-token",
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const textContent = content[0];
    expect(textContent.text).toContain("Invalid session token");
  });

  // Note: Audit logging is now emitter-based (no SQLite).
  // Audit emission is tested in credential service unit tests.
});
