/**
 * End-to-End Integration Test — Native Mason Proxy
 *
 * Exercises the full proxy pipeline with a real upstream MCP server:
 *   UpstreamManager → ToolRouter → ProxyServer → MCP Client
 *
 * Uses @modelcontextprotocol/server-filesystem as the upstream via stdio.
 *
 * Note: Audit logging is now relay-based (audit_event messages). Since
 * no relay is connected in this integration test, audit events are
 * silently dropped. Audit behavior is tested in hooks/audit.test.ts.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ProxyServer } from "../src/server.js";
import { UpstreamManager } from "../src/upstream.js";
import { ToolRouter } from "../src/router.js";
import type { ResolvedApp, ToolFilter } from "@clawmasons/shared";

// ── Constants ──────────────────────────────────────────────────────────

const TEST_PORT = 19200;
const APP_NAME = "@clawmasons/app-filesystem";
const AGENT_NAME = "integration-test";

// ── Shared State ───────────────────────────────────────────────────────

let tmpDir: string;
let upstream: UpstreamManager;
let router: ToolRouter;
let server: ProxyServer;
let client: Client;

// ── Setup / Teardown ───────────────────────────────────────────────────

beforeAll(async () => {
  // 1. Create temp workspace for the filesystem server
  // Use realpathSync to resolve macOS /tmp → /private/var/folders symlinks
  // so paths match what the filesystem server considers "allowed"
  tmpDir = realpathSync(mkdtempSync(join(tmpdir(), "mason-integration-")));

  // Seed a test file so we can verify reads
  writeFileSync(join(tmpDir, "hello.txt"), "Hello from mason integration test");

  // 2. Configure UpstreamManager with real filesystem server
  const filesystemApp: ResolvedApp = {
    name: APP_NAME,
    version: "0.0.0",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", tmpDir],
    tools: ["read_file", "write_file", "list_directory", "create_directory"],
    capabilities: [],
    credentials: [],
  };

  upstream = new UpstreamManager([{ name: APP_NAME, app: filesystemApp }]);
  await upstream.initialize(30_000);

  // 3. Discover tools from upstream and build router
  const upstreamTools = new Map<string, Tool[]>();
  const tools = await upstream.getTools(APP_NAME);
  upstreamTools.set(APP_NAME, tools);
  // Allow all discovered tools (simulates a permissive role)
  const toolFilters = new Map<string, ToolFilter>([
    [APP_NAME, { mode: "allow", list: tools.map((t) => t.name) }],
  ]);
  router = new ToolRouter(upstreamTools, toolFilters);

  // 4. Start ProxyServer (no relay/db — audit events silently dropped)
  server = new ProxyServer({
    port: TEST_PORT,
    transport: "streamable-http",
    router,
    upstream,
    agentName: AGENT_NAME,
  });
  await server.start();

  // 5. Connect MCP client
  client = new Client({ name: "integration-test-client", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://localhost:${TEST_PORT}/mcp`),
  );
  await client.connect(transport);
}, 60_000);

afterAll(async () => {
  try { await client?.close(); } catch { /* ignore */ }
  try { await server?.stop(); } catch { /* ignore */ }
  try { await upstream?.shutdown(); } catch { /* ignore */ }
  try {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  } catch { /* ignore */ }
});

// ── Tests ──────────────────────────────────────────────────────────────

describe("Mason Proxy Integration", () => {

  // Scenario 1: Proxy starts and accepts connections
  it("proxy accepts MCP connections and lists tools", async () => {
    const result = await client.listTools();
    expect(result.tools.length).toBeGreaterThan(0);
  });

  // Scenario 2: tools/list returns prefixed, filtered tools
  it("tools/list returns prefixed filesystem tools", async () => {
    const result = await client.listTools();
    const toolNames = result.tools.map((t) => t.name);

    // All tools should be prefixed with "filesystem_"
    for (const name of toolNames) {
      expect(name).toMatch(/^filesystem_/);
    }

    // Known filesystem tools should be present
    expect(toolNames).toContain("filesystem_read_file");
    expect(toolNames).toContain("filesystem_write_file");
    expect(toolNames).toContain("filesystem_list_directory");
  });

  // Scenario 3: tools/call with valid tool returns correct result
  it("tools/call executes filesystem_read_file and returns content", async () => {
    const result = await client.callTool({
      name: "filesystem_read_file",
      arguments: { path: join(tmpDir, "hello.txt") },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("");
    expect(text).toContain("Hello from mason integration test");
  });

  // Scenario 3b: Write + read round-trip
  it("tools/call write_file + read_file round-trip succeeds", async () => {
    const testContent = `Test content ${Date.now()}`;
    const testPath = join(tmpDir, "roundtrip.txt");

    // Write
    const writeResult = await client.callTool({
      name: "filesystem_write_file",
      arguments: { path: testPath, content: testContent },
    });
    expect(writeResult.isError).toBeFalsy();

    // Read back
    const readResult = await client.callTool({
      name: "filesystem_read_file",
      arguments: { path: testPath },
    });
    expect(readResult.isError).toBeFalsy();
    const text = (readResult.content as Array<{ type: string; text: string }>)
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("");
    expect(text).toContain(testContent);
  });

  // Scenario 4: Unknown tool returns error
  it("tools/call with unknown tool returns isError", async () => {
    const result = await client.callTool({
      name: "nonexistent_tool",
    });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      { type: "text", text: "Unknown tool: nonexistent_tool" },
    ]);
  });

  // Scenario 5: Clean shutdown
  it("proxy server shuts down cleanly", async () => {
    // Create a second server to test shutdown without affecting other tests
    const shutdownPort = TEST_PORT + 1;
    const shutdownServer = new ProxyServer({
      port: shutdownPort,
      transport: "streamable-http",
      router,
      upstream,
    });
    await shutdownServer.start();

    // Verify it's listening
    const shutdownClient = new Client({ name: "shutdown-test", version: "0.1.0" });
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://localhost:${shutdownPort}/mcp`),
    );
    await shutdownClient.connect(transport);
    const result = await shutdownClient.listTools();
    expect(result.tools.length).toBeGreaterThan(0);

    // Clean shutdown
    await shutdownClient.close();
    await shutdownServer.stop();

    // Verify server is no longer accepting connections
    const postShutdownClient = new Client({ name: "post-shutdown", version: "0.1.0" });
    const postTransport = new StreamableHTTPClientTransport(
      new URL(`http://localhost:${shutdownPort}/mcp`),
    );
    await expect(postShutdownClient.connect(postTransport)).rejects.toThrow();
  });
});
