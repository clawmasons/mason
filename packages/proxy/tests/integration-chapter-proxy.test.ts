/**
 * End-to-End Integration Test — Native Chapter Proxy
 *
 * Exercises the full proxy pipeline with a real upstream MCP server:
 *   UpstreamManager → ToolRouter → ChapterProxyServer → MCP Client
 *
 * Uses @modelcontextprotocol/server-filesystem as the upstream via stdio.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ChapterProxyServer } from "../src/server.js";
import { UpstreamManager } from "../src/upstream.js";
import { ToolRouter } from "../src/router.js";
import { openDatabase, queryAuditLog } from "../src/db.js";
import type Database from "better-sqlite3";
import type { ResolvedApp, ToolFilter } from "@clawmasons/shared";

// ── Constants ──────────────────────────────────────────────────────────

const TEST_PORT = 19200;
const APP_NAME = "@clawmasons/app-filesystem";
const AGENT_NAME = "integration-test";

// ── Shared State ───────────────────────────────────────────────────────

let tmpDir: string;
let dbPath: string;
let db: Database.Database;
let upstream: UpstreamManager;
let router: ToolRouter;
let server: ChapterProxyServer;
let client: Client;

// ── Setup / Teardown ───────────────────────────────────────────────────

beforeAll(async () => {
  // 1. Create temp workspace for the filesystem server
  // Use realpathSync to resolve macOS /tmp → /private/var/folders symlinks
  // so paths match what the filesystem server considers "allowed"
  tmpDir = realpathSync(mkdtempSync(join(tmpdir(), "chapter-integration-")));

  // Seed a test file so we can verify reads
  writeFileSync(join(tmpDir, "hello.txt"), "Hello from chapter integration test");

  // 2. Open temp SQLite database
  dbPath = join(tmpDir, "chapter-test.db");
  db = openDatabase(dbPath);

  // 3. Configure UpstreamManager with real filesystem server
  const filesystemApp: ResolvedApp = {
    name: APP_NAME,
    version: "0.0.0",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", tmpDir],
    tools: ["read_file", "write_file", "list_directory", "create_directory"],
    capabilities: [],
  };

  upstream = new UpstreamManager([{ name: APP_NAME, app: filesystemApp }]);
  await upstream.initialize(30_000);

  // 4. Discover tools from upstream and build router
  const upstreamTools = new Map<string, Tool[]>();
  const tools = await upstream.getTools(APP_NAME);
  upstreamTools.set(APP_NAME, tools);
  // Allow all discovered tools (simulates a permissive role)
  const toolFilters = new Map<string, ToolFilter>([
    [APP_NAME, { mode: "allow", list: tools.map((t) => t.name) }],
  ]);
  router = new ToolRouter(upstreamTools, toolFilters);

  // 5. Start ChapterProxyServer
  server = new ChapterProxyServer({
    port: TEST_PORT,
    transport: "streamable-http",
    router,
    upstream,
    db,
    agentName: AGENT_NAME,
  });
  await server.start();

  // 6. Connect MCP client
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
  try { db?.close(); } catch { /* ignore */ }
  try {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  } catch { /* ignore */ }
});

// ── Tests ──────────────────────────────────────────────────────────────

describe("Chapter Proxy Integration", () => {

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
    expect(text).toContain("Hello from chapter integration test");
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

  // Scenario 4: Unknown tool returns error + audit log "denied"
  it("tools/call with unknown tool returns isError and logs denied", async () => {
    const result = await client.callTool({
      name: "nonexistent_tool",
    });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      { type: "text", text: "Unknown tool: nonexistent_tool" },
    ]);

    // Verify audit log
    const entries = queryAuditLog(db);
    const denied = entries.find(
      (e) => e.tool_name === "nonexistent_tool" && e.status === "denied",
    );
    expect(denied).toBeDefined();
    expect(denied!.agent_name).toBe(AGENT_NAME);
  });

  // Scenario 5: Audit log populated after successful tool call
  it("audit log contains entries for successful tool calls", async () => {
    const entries = queryAuditLog(db);
    const successEntries = entries.filter((e) => e.status === "success");
    expect(successEntries.length).toBeGreaterThan(0);

    const entry = successEntries[0]!;
    expect(entry.agent_name).toBe(AGENT_NAME);
    expect(entry.app_name).toBe(APP_NAME);
    expect(entry.duration_ms).toBeGreaterThanOrEqual(0);
    expect(entry.tool_name).toBeTruthy();
  });
});

// ── Approval Workflow Tests (separate server instance) ─────────────────

describe("Chapter Proxy Integration — Approval Workflow", () => {
  let approvalServer: ChapterProxyServer;
  let approvalClient: Client;
  let approvalDb: Database.Database;
  const APPROVAL_PORT = TEST_PORT + 1;

  beforeAll(async () => {
    // Use a separate DB for approval tests to avoid interference
    const approvalDbPath = join(tmpDir, "chapter-approval-test.db");
    approvalDb = openDatabase(approvalDbPath);

    approvalServer = new ChapterProxyServer({
      port: APPROVAL_PORT,
      transport: "streamable-http",
      router,
      upstream,
      db: approvalDb,
      agentName: AGENT_NAME,
      approvalPatterns: ["filesystem_write_*"],
      approvalOptions: { ttlSeconds: 1, pollIntervalMs: 50 },
    });
    await approvalServer.start();

    approvalClient = new Client({ name: "approval-test-client", version: "0.1.0" });
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://localhost:${APPROVAL_PORT}/mcp`),
    );
    await approvalClient.connect(transport);
  }, 30_000);

  afterAll(async () => {
    try { await approvalClient?.close(); } catch { /* ignore */ }
    try { await approvalServer?.stop(); } catch { /* ignore */ }
    try { approvalDb?.close(); } catch { /* ignore */ }
  });

  // Scenario 6: Approval-required tool auto-denies after TTL
  it("approval-required tool times out and auto-denies", async () => {
    const result = await approvalClient.callTool({
      name: "filesystem_write_file",
      arguments: { path: join(tmpDir, "blocked.txt"), content: "should not write" },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(text).toContain("timed out");

    // Verify audit log shows timeout
    const entries = queryAuditLog(approvalDb);
    const timeoutEntry = entries.find((e) => e.status === "timeout");
    expect(timeoutEntry).toBeDefined();
    expect(timeoutEntry!.tool_name).toBe("write_file");

    // Verify the file was NOT written
    expect(existsSync(join(tmpDir, "blocked.txt"))).toBe(false);
  }, 15_000);

  // Non-matching tool proceeds without approval
  it("non-matching tool proceeds without approval", async () => {
    const result = await approvalClient.callTool({
      name: "filesystem_read_file",
      arguments: { path: join(tmpDir, "hello.txt") },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("");
    expect(text).toContain("Hello from chapter integration test");
  });

  // Scenario 7 (partial): Clean shutdown
  it("proxy server shuts down cleanly", async () => {
    // Create a second server to test shutdown without affecting other tests
    const shutdownPort = APPROVAL_PORT + 1;
    const shutdownServer = new ChapterProxyServer({
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
