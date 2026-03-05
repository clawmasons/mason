import { describe, it, expect, afterEach, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ForgeProxyServer } from "../../src/proxy/server.js";
import type { ToolRouter, RouteEntry } from "../../src/proxy/router.js";
import type { UpstreamManager } from "../../src/proxy/upstream.js";

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
  return { callTool } as unknown as UpstreamManager;
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
