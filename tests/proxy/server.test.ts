import { describe, it, expect, afterEach, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Tool, Resource, Prompt, CallToolResult, ReadResourceResult, GetPromptResult } from "@modelcontextprotocol/sdk/types.js";
import { ForgeProxyServer } from "../../src/proxy/server.js";
import type { ToolRouter, RouteEntry, ResourceRouter, PromptRouter, PromptRouteEntry } from "../../src/proxy/router.js";
import type { UpstreamManager } from "../../src/proxy/upstream.js";
import { openDatabase, queryAuditLog, updateApprovalStatus } from "../../src/proxy/db.js";
import type Database from "better-sqlite3";

// ── Fixtures ────────────────────────────────────────────────────────────

function makeTool(name: string, description?: string): Tool {
  return {
    name,
    description: description ?? `Tool: ${name}`,
    inputSchema: {
      type: "object" as const,
      properties: { arg1: { type: "string" } },
    },
  };
}

function makeRouteEntry(
  appName: string,
  appShortName: string,
  originalToolName: string,
): RouteEntry {
  const prefixedToolName = `${appShortName}_${originalToolName}`;
  return {
    appName,
    appShortName,
    originalToolName,
    prefixedToolName,
    tool: makeTool(prefixedToolName),
  };
}

function createMockRouter(tools: Tool[], routes: Map<string, RouteEntry>): ToolRouter {
  return {
    listTools: vi.fn(() => tools),
    resolve: vi.fn((name: string) => routes.get(name) ?? null),
  } as unknown as ToolRouter;
}

function createMockUpstream(
  callToolResult?: CallToolResult,
  callToolError?: Error,
): UpstreamManager {
  const callTool = vi.fn(async () => {
    if (callToolError) throw callToolError;
    return callToolResult ?? {
      content: [{ type: "text" as const, text: "ok" }],
    };
  });
  const readResource = vi.fn(async (): Promise<ReadResourceResult> => ({
    contents: [{ uri: "repo://owner/name", text: "resource data" }],
  }));
  const getPrompt = vi.fn(async (): Promise<GetPromptResult> => ({
    messages: [{ role: "user" as const, content: { type: "text" as const, text: "prompt result" } }],
  }));
  return { callTool, readResource, getPrompt } as unknown as UpstreamManager;
}

function makeResource(name: string, uri: string): Resource {
  return { name, uri, description: `Resource: ${name}` };
}

function makePromptObj(name: string): Prompt {
  return { name, description: `Prompt: ${name}` };
}

function createMockResourceRouter(resources: Resource[], uriMap: Map<string, { appName: string; originalUri: string }>): ResourceRouter {
  return {
    listResources: vi.fn(() => resources),
    resolveUri: vi.fn((uri: string) => uriMap.get(uri) ?? null),
  } as unknown as ResourceRouter;
}

function createMockPromptRouter(prompts: Prompt[], routes: Map<string, PromptRouteEntry>): PromptRouter {
  return {
    listPrompts: vi.fn(() => prompts),
    resolve: vi.fn((name: string) => routes.get(name) ?? null),
  } as unknown as PromptRouter;
}

// ── Helper: connect a client to the proxy ────────────────────────────

async function connectClient(
  port: number,
  transportType: "sse" | "streamable-http",
): Promise<Client> {
  const client = new Client({ name: "test-client", version: "0.1.0" });

  if (transportType === "sse") {
    const transport = new SSEClientTransport(
      new URL(`http://localhost:${port}/sse`),
    );
    await client.connect(transport);
  } else {
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://localhost:${port}/mcp`),
    );
    await client.connect(transport);
  }

  return client;
}

// ── Test port management ────────────────────────────────────────────

let nextPort = 19100;
function getPort(): number {
  return nextPort++;
}

// ── SSE Transport Tests ─────────────────────────────────────────────

describe("ForgeProxyServer (SSE)", () => {
  let server: ForgeProxyServer;
  let client: Client;

  afterEach(async () => {
    try { await client?.close(); } catch { /* ignore */ }
    try { await server?.stop(); } catch { /* ignore */ }
  });

  it("tools/list returns prefixed tools from router", async () => {
    const port = getPort();
    const tools = [makeTool("github_create_pr"), makeTool("slack_send_message")];
    const router = createMockRouter(tools, new Map());
    const upstream = createMockUpstream();

    server = new ForgeProxyServer({ port, transport: "sse", router, upstream });
    await server.start();

    client = await connectClient(port, "sse");
    const result = await client.listTools();

    expect(result.tools).toHaveLength(2);
    expect(result.tools.map((t) => t.name).sort()).toEqual([
      "github_create_pr",
      "slack_send_message",
    ]);
    expect(router.listTools).toHaveBeenCalled();
  });

  it("tools/list returns empty array when router has no tools", async () => {
    const port = getPort();
    const router = createMockRouter([], new Map());
    const upstream = createMockUpstream();

    server = new ForgeProxyServer({ port, transport: "sse", router, upstream });
    await server.start();

    client = await connectClient(port, "sse");
    const result = await client.listTools();

    expect(result.tools).toHaveLength(0);
  });

  it("tools/call with valid tool resolves and forwards to upstream", async () => {
    const port = getPort();
    const route = makeRouteEntry("@clawforge/app-github", "github", "create_pr");
    const routes = new Map([["github_create_pr", route]]);
    const router = createMockRouter([route.tool], routes);
    const upstream = createMockUpstream({
      content: [{ type: "text", text: "PR #42 created" }],
    });

    server = new ForgeProxyServer({ port, transport: "sse", router, upstream });
    await server.start();

    client = await connectClient(port, "sse");
    const result = await client.callTool({
      name: "github_create_pr",
      arguments: { title: "Fix bug" },
    });

    expect(result.content).toEqual([{ type: "text", text: "PR #42 created" }]);
    expect(router.resolve).toHaveBeenCalledWith("github_create_pr");
    expect(upstream.callTool).toHaveBeenCalledWith(
      "@clawforge/app-github",
      "create_pr",
      { title: "Fix bug" },
    );
  });

  it("tools/call with unknown tool returns isError", async () => {
    const port = getPort();
    const router = createMockRouter([], new Map());
    const upstream = createMockUpstream();

    server = new ForgeProxyServer({ port, transport: "sse", router, upstream });
    await server.start();

    client = await connectClient(port, "sse");
    const result = await client.callTool({
      name: "github_delete_repo",
    });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      { type: "text", text: "Unknown tool: github_delete_repo" },
    ]);
    expect(upstream.callTool).not.toHaveBeenCalled();
  });

  it("tools/call when upstream throws returns isError with message", async () => {
    const port = getPort();
    const route = makeRouteEntry("@clawforge/app-github", "github", "create_pr");
    const routes = new Map([["github_create_pr", route]]);
    const router = createMockRouter([route.tool], routes);
    const upstream = createMockUpstream(
      undefined,
      new Error("Connection refused"),
    );

    server = new ForgeProxyServer({ port, transport: "sse", router, upstream });
    await server.start();

    client = await connectClient(port, "sse");
    const result = await client.callTool({
      name: "github_create_pr",
      arguments: {},
    });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      { type: "text", text: "Connection refused" },
    ]);
  });

  it("start() and stop() lifecycle works cleanly", async () => {
    const port = getPort();
    const router = createMockRouter([], new Map());
    const upstream = createMockUpstream();

    server = new ForgeProxyServer({ port, transport: "sse", router, upstream });
    await server.start();

    // Verify server is listening by connecting
    client = await connectClient(port, "sse");
    await client.listTools();
    await client.close();

    // Stop and verify no error
    await server.stop();

    // Verify server is no longer listening
    await expect(connectClient(port, "sse")).rejects.toThrow();
  });

  it("stop() on never-started server resolves without error", async () => {
    const router = createMockRouter([], new Map());
    const upstream = createMockUpstream();

    server = new ForgeProxyServer({ port: getPort(), transport: "sse", router, upstream });
    await expect(server.stop()).resolves.toBeUndefined();
  });

  it("uses custom port configuration", async () => {
    const port = getPort();
    const router = createMockRouter([], new Map());
    const upstream = createMockUpstream();

    server = new ForgeProxyServer({ port, transport: "sse", router, upstream });
    await server.start();

    client = await connectClient(port, "sse");
    const result = await client.listTools();
    expect(result.tools).toHaveLength(0);
  });
});

// ── Streamable HTTP Transport Tests ─────────────────────────────────

describe("ForgeProxyServer (streamable-http)", () => {
  let server: ForgeProxyServer;
  let client: Client;

  afterEach(async () => {
    try { await client?.close(); } catch { /* ignore */ }
    try { await server?.stop(); } catch { /* ignore */ }
  });

  it("tools/list returns prefixed tools from router", async () => {
    const port = getPort();
    const tools = [makeTool("github_create_pr"), makeTool("slack_send_message")];
    const router = createMockRouter(tools, new Map());
    const upstream = createMockUpstream();

    server = new ForgeProxyServer({ port, transport: "streamable-http", router, upstream });
    await server.start();

    client = await connectClient(port, "streamable-http");
    const result = await client.listTools();

    expect(result.tools).toHaveLength(2);
    expect(result.tools.map((t) => t.name).sort()).toEqual([
      "github_create_pr",
      "slack_send_message",
    ]);
  });

  it("tools/call with valid tool resolves and forwards to upstream", async () => {
    const port = getPort();
    const route = makeRouteEntry("@clawforge/app-github", "github", "create_pr");
    const routes = new Map([["github_create_pr", route]]);
    const router = createMockRouter([route.tool], routes);
    const upstream = createMockUpstream({
      content: [{ type: "text", text: "PR #42 created" }],
    });

    server = new ForgeProxyServer({ port, transport: "streamable-http", router, upstream });
    await server.start();

    client = await connectClient(port, "streamable-http");
    const result = await client.callTool({
      name: "github_create_pr",
      arguments: { title: "Fix bug" },
    });

    expect(result.content).toEqual([{ type: "text", text: "PR #42 created" }]);
    expect(upstream.callTool).toHaveBeenCalledWith(
      "@clawforge/app-github",
      "create_pr",
      { title: "Fix bug" },
    );
  });

  it("tools/call with unknown tool returns isError", async () => {
    const port = getPort();
    const router = createMockRouter([], new Map());
    const upstream = createMockUpstream();

    server = new ForgeProxyServer({ port, transport: "streamable-http", router, upstream });
    await server.start();

    client = await connectClient(port, "streamable-http");
    const result = await client.callTool({ name: "unknown_tool" });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      { type: "text", text: "Unknown tool: unknown_tool" },
    ]);
  });

  it("tools/call when upstream throws returns isError with message", async () => {
    const port = getPort();
    const route = makeRouteEntry("@clawforge/app-github", "github", "create_pr");
    const routes = new Map([["github_create_pr", route]]);
    const router = createMockRouter([route.tool], routes);
    const upstream = createMockUpstream(
      undefined,
      new Error("Timeout waiting for response"),
    );

    server = new ForgeProxyServer({ port, transport: "streamable-http", router, upstream });
    await server.start();

    client = await connectClient(port, "streamable-http");
    const result = await client.callTool({
      name: "github_create_pr",
      arguments: {},
    });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      { type: "text", text: "Timeout waiting for response" },
    ]);
  });
});

// ── Audit Logging Integration Tests ──────────────────────────────────

describe("ForgeProxyServer (audit logging)", () => {
  let server: ForgeProxyServer;
  let client: Client;
  let db: Database.Database;

  afterEach(async () => {
    try { await client?.close(); } catch { /* ignore */ }
    try { await server?.stop(); } catch { /* ignore */ }
    try { db?.close(); } catch { /* ignore */ }
  });

  it("logs successful tool call to audit_log", async () => {
    const port = getPort();
    db = openDatabase(":memory:");
    const route = makeRouteEntry("@clawforge/app-github", "github", "create_pr");
    const routes = new Map([["github_create_pr", route]]);
    const router = createMockRouter([route.tool], routes);
    const upstream = createMockUpstream({
      content: [{ type: "text", text: "PR #42 created" }],
    });

    server = new ForgeProxyServer({
      port,
      transport: "sse",
      router,
      upstream,
      db,
      agentName: "note-taker",
    });
    await server.start();

    client = await connectClient(port, "sse");
    await client.callTool({
      name: "github_create_pr",
      arguments: { title: "Fix bug" },
    });

    const entries = queryAuditLog(db);
    expect(entries).toHaveLength(1);
    expect(entries[0].agent_name).toBe("note-taker");
    expect(entries[0].app_name).toBe("@clawforge/app-github");
    expect(entries[0].tool_name).toBe("create_pr");
    expect(entries[0].status).toBe("success");
    expect(entries[0].duration_ms).toBeGreaterThanOrEqual(0);
    expect(JSON.parse(entries[0].arguments!)).toEqual({ title: "Fix bug" });
  });

  it("logs denied tool call to audit_log", async () => {
    const port = getPort();
    db = openDatabase(":memory:");
    const router = createMockRouter([], new Map());
    const upstream = createMockUpstream();

    server = new ForgeProxyServer({
      port,
      transport: "sse",
      router,
      upstream,
      db,
      agentName: "note-taker",
    });
    await server.start();

    client = await connectClient(port, "sse");
    await client.callTool({ name: "github_delete_repo" });

    const entries = queryAuditLog(db);
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe("denied");
    expect(entries[0].tool_name).toBe("github_delete_repo");
  });

  it("logs error tool call to audit_log", async () => {
    const port = getPort();
    db = openDatabase(":memory:");
    const route = makeRouteEntry("@clawforge/app-github", "github", "create_pr");
    const routes = new Map([["github_create_pr", route]]);
    const router = createMockRouter([route.tool], routes);
    const upstream = createMockUpstream(undefined, new Error("Connection refused"));

    server = new ForgeProxyServer({
      port,
      transport: "sse",
      router,
      upstream,
      db,
      agentName: "note-taker",
    });
    await server.start();

    client = await connectClient(port, "sse");
    await client.callTool({ name: "github_create_pr", arguments: {} });

    const entries = queryAuditLog(db);
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe("error");
    expect(entries[0].result).toContain("Connection refused");
  });

  it("does not log when db is not configured", async () => {
    const port = getPort();
    const route = makeRouteEntry("@clawforge/app-github", "github", "create_pr");
    const routes = new Map([["github_create_pr", route]]);
    const router = createMockRouter([route.tool], routes);
    const upstream = createMockUpstream({
      content: [{ type: "text", text: "ok" }],
    });

    // No db provided
    server = new ForgeProxyServer({ port, transport: "sse", router, upstream });
    await server.start();

    client = await connectClient(port, "sse");
    const result = await client.callTool({
      name: "github_create_pr",
      arguments: {},
    });

    expect(result.content).toEqual([{ type: "text", text: "ok" }]);
    // No assertion on db — it was never provided, so no logging happens
  });
});

// ── Approval Workflow Integration Tests ──────────────────────────────

describe("ForgeProxyServer (approval workflow)", () => {
  let server: ForgeProxyServer;
  let client: Client;
  let db: Database.Database;

  afterEach(async () => {
    try { await client?.close(); } catch { /* ignore */ }
    try { await server?.stop(); } catch { /* ignore */ }
    try { db?.close(); } catch { /* ignore */ }
  });

  it("tool matching approval pattern is approved and call proceeds", async () => {
    const port = getPort();
    db = openDatabase(":memory:");
    const route = makeRouteEntry("@clawforge/app-github", "github", "delete_repo");
    const routes = new Map([["github_delete_repo", route]]);
    const router = createMockRouter([route.tool], routes);
    const upstream = createMockUpstream({
      content: [{ type: "text", text: "Repo deleted" }],
    });

    server = new ForgeProxyServer({
      port,
      transport: "sse",
      router,
      upstream,
      db,
      agentName: "note-taker",
      approvalPatterns: ["github_delete_*"],
      approvalOptions: { ttlSeconds: 5, pollIntervalMs: 50 },
    });
    await server.start();

    client = await connectClient(port, "sse");

    // Start the tool call (it will block waiting for approval)
    const callPromise = client.callTool({
      name: "github_delete_repo",
      arguments: { repo: "test" },
    });

    // Approve after a short delay
    setTimeout(() => {
      const rows = db.prepare("SELECT id FROM approval_requests WHERE status = 'pending'").all() as Array<{ id: string }>;
      if (rows.length > 0) {
        updateApprovalStatus(db, rows[0].id, "approved", "operator");
      }
    }, 150);

    const result = await callPromise;
    expect(result.content).toEqual([{ type: "text", text: "Repo deleted" }]);
    expect(upstream.callTool).toHaveBeenCalled();

    // Verify audit log shows success
    const entries = queryAuditLog(db);
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe("success");
  });

  it("tool matching approval pattern is denied and call is blocked", async () => {
    const port = getPort();
    db = openDatabase(":memory:");
    const route = makeRouteEntry("@clawforge/app-github", "github", "delete_repo");
    const routes = new Map([["github_delete_repo", route]]);
    const router = createMockRouter([route.tool], routes);
    const upstream = createMockUpstream();

    server = new ForgeProxyServer({
      port,
      transport: "sse",
      router,
      upstream,
      db,
      agentName: "note-taker",
      approvalPatterns: ["github_delete_*"],
      approvalOptions: { ttlSeconds: 5, pollIntervalMs: 50 },
    });
    await server.start();

    client = await connectClient(port, "sse");

    const callPromise = client.callTool({
      name: "github_delete_repo",
      arguments: { repo: "test" },
    });

    // Deny after a short delay
    setTimeout(() => {
      const rows = db.prepare("SELECT id FROM approval_requests WHERE status = 'pending'").all() as Array<{ id: string }>;
      if (rows.length > 0) {
        updateApprovalStatus(db, rows[0].id, "denied", "operator");
      }
    }, 150);

    const result = await callPromise;
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      { type: "text", text: "Tool call denied: github_delete_repo requires approval" },
    ]);
    expect(upstream.callTool).not.toHaveBeenCalled();

    // Verify audit log shows denied
    const entries = queryAuditLog(db);
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe("denied");
  });

  it("tool matching approval pattern times out and auto-denies", async () => {
    const port = getPort();
    db = openDatabase(":memory:");
    const route = makeRouteEntry("@clawforge/app-github", "github", "delete_repo");
    const routes = new Map([["github_delete_repo", route]]);
    const router = createMockRouter([route.tool], routes);
    const upstream = createMockUpstream();

    server = new ForgeProxyServer({
      port,
      transport: "sse",
      router,
      upstream,
      db,
      agentName: "note-taker",
      approvalPatterns: ["github_delete_*"],
      approvalOptions: { ttlSeconds: 0.2, pollIntervalMs: 50 },
    });
    await server.start();

    client = await connectClient(port, "sse");

    const result = await client.callTool({
      name: "github_delete_repo",
      arguments: { repo: "test" },
    });

    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0].text).toContain("timed out");
    expect(upstream.callTool).not.toHaveBeenCalled();

    // Verify audit log shows timeout
    const entries = queryAuditLog(db);
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe("timeout");
  });

  it("tool not matching approval patterns proceeds without approval", async () => {
    const port = getPort();
    db = openDatabase(":memory:");
    const route = makeRouteEntry("@clawforge/app-github", "github", "list_repos");
    const routes = new Map([["github_list_repos", route]]);
    const router = createMockRouter([route.tool], routes);
    const upstream = createMockUpstream({
      content: [{ type: "text", text: "repos listed" }],
    });

    server = new ForgeProxyServer({
      port,
      transport: "sse",
      router,
      upstream,
      db,
      agentName: "note-taker",
      approvalPatterns: ["github_delete_*"],
      approvalOptions: { ttlSeconds: 5, pollIntervalMs: 50 },
    });
    await server.start();

    client = await connectClient(port, "sse");

    const result = await client.callTool({
      name: "github_list_repos",
      arguments: {},
    });

    expect(result.content).toEqual([{ type: "text", text: "repos listed" }]);
    expect(upstream.callTool).toHaveBeenCalled();

    // No approval requests should exist
    const approvalRows = db.prepare("SELECT * FROM approval_requests").all();
    expect(approvalRows).toHaveLength(0);
  });
});

// ── Resource Passthrough Tests ──────────────────────────────────────

describe("ForgeProxyServer (resources)", () => {
  let server: ForgeProxyServer;
  let client: Client;

  afterEach(async () => {
    try { await client?.close(); } catch { /* ignore */ }
    try { await server?.stop(); } catch { /* ignore */ }
  });

  it("resources/list returns prefixed resources from router", async () => {
    const port = getPort();
    const resources = [makeResource("github_repository", "repo://owner/name")];
    const resourceRouter = createMockResourceRouter(resources, new Map());
    const router = createMockRouter([], new Map());
    const upstream = createMockUpstream();

    server = new ForgeProxyServer({ port, transport: "sse", router, upstream, resourceRouter });
    await server.start();

    client = await connectClient(port, "sse");
    const result = await client.listResources();

    expect(result.resources).toHaveLength(1);
    expect(result.resources[0]!.name).toBe("github_repository");
    expect(result.resources[0]!.uri).toBe("repo://owner/name");
  });

  it("resources/read with valid URI forwards to upstream", async () => {
    const port = getPort();
    const uriMap = new Map([
      ["repo://owner/name", { appName: "@clawforge/app-github", originalUri: "repo://owner/name" }],
    ]);
    const resourceRouter = createMockResourceRouter([], uriMap);
    const router = createMockRouter([], new Map());
    const upstream = createMockUpstream();

    server = new ForgeProxyServer({ port, transport: "sse", router, upstream, resourceRouter });
    await server.start();

    client = await connectClient(port, "sse");
    const result = await client.readResource({ uri: "repo://owner/name" });

    expect(result.contents).toHaveLength(1);
    expect((result.contents[0] as { text: string }).text).toBe("resource data");
    expect(upstream.readResource).toHaveBeenCalledWith("@clawforge/app-github", "repo://owner/name");
  });

  it("resources/read with unknown URI returns error", async () => {
    const port = getPort();
    const resourceRouter = createMockResourceRouter([], new Map());
    const router = createMockRouter([], new Map());
    const upstream = createMockUpstream();

    server = new ForgeProxyServer({ port, transport: "sse", router, upstream, resourceRouter });
    await server.start();

    client = await connectClient(port, "sse");
    await expect(client.readResource({ uri: "unknown://foo" })).rejects.toThrow(/Unknown resource/);
  });

  it("resources work via streamable-http transport", async () => {
    const port = getPort();
    const resources = [makeResource("slack_channel", "slack://channel/general")];
    const resourceRouter = createMockResourceRouter(resources, new Map());
    const router = createMockRouter([], new Map());
    const upstream = createMockUpstream();

    server = new ForgeProxyServer({ port, transport: "streamable-http", router, upstream, resourceRouter });
    await server.start();

    client = await connectClient(port, "streamable-http");
    const result = await client.listResources();

    expect(result.resources).toHaveLength(1);
    expect(result.resources[0]!.name).toBe("slack_channel");
  });
});

// ── Prompt Passthrough Tests ────────────────────────────────────────

describe("ForgeProxyServer (prompts)", () => {
  let server: ForgeProxyServer;
  let client: Client;

  afterEach(async () => {
    try { await client?.close(); } catch { /* ignore */ }
    try { await server?.stop(); } catch { /* ignore */ }
  });

  it("prompts/list returns prefixed prompts from router", async () => {
    const port = getPort();
    const prompts = [makePromptObj("github_pr_review")];
    const promptRouter = createMockPromptRouter(prompts, new Map());
    const router = createMockRouter([], new Map());
    const upstream = createMockUpstream();

    server = new ForgeProxyServer({ port, transport: "sse", router, upstream, promptRouter });
    await server.start();

    client = await connectClient(port, "sse");
    const result = await client.listPrompts();

    expect(result.prompts).toHaveLength(1);
    expect(result.prompts[0]!.name).toBe("github_pr_review");
  });

  it("prompts/get with valid name forwards to upstream", async () => {
    const port = getPort();
    const entry: PromptRouteEntry = {
      appName: "@clawforge/app-github",
      appShortName: "github",
      originalName: "pr_review",
      prefixedName: "github_pr_review",
      prompt: makePromptObj("github_pr_review"),
    };
    const routes = new Map([["github_pr_review", entry]]);
    const promptRouter = createMockPromptRouter([entry.prompt], routes);
    const router = createMockRouter([], new Map());
    const upstream = createMockUpstream();

    server = new ForgeProxyServer({ port, transport: "sse", router, upstream, promptRouter });
    await server.start();

    client = await connectClient(port, "sse");
    const result = await client.getPrompt({ name: "github_pr_review", arguments: { pr_number: "42" } });

    expect(result.messages).toHaveLength(1);
    expect(upstream.getPrompt).toHaveBeenCalledWith(
      "@clawforge/app-github",
      "pr_review",
      { pr_number: "42" },
    );
  });

  it("prompts/get with unknown name returns error", async () => {
    const port = getPort();
    const promptRouter = createMockPromptRouter([], new Map());
    const router = createMockRouter([], new Map());
    const upstream = createMockUpstream();

    server = new ForgeProxyServer({ port, transport: "sse", router, upstream, promptRouter });
    await server.start();

    client = await connectClient(port, "sse");
    await expect(client.getPrompt({ name: "unknown_prompt" })).rejects.toThrow(/Unknown prompt/);
  });

  it("prompts work via streamable-http transport", async () => {
    const port = getPort();
    const prompts = [makePromptObj("slack_standup")];
    const promptRouter = createMockPromptRouter(prompts, new Map());
    const router = createMockRouter([], new Map());
    const upstream = createMockUpstream();

    server = new ForgeProxyServer({ port, transport: "streamable-http", router, upstream, promptRouter });
    await server.start();

    client = await connectClient(port, "streamable-http");
    const result = await client.listPrompts();

    expect(result.prompts).toHaveLength(1);
    expect(result.prompts[0]!.name).toBe("slack_standup");
  });
});
