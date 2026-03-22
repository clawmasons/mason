import { describe, it, expect, afterEach, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Tool, Resource, Prompt, CallToolResult, ReadResourceResult, GetPromptResult } from "@modelcontextprotocol/sdk/types.js";
import { ProxyServer } from "../src/server.js";
import type { ToolRouter, RouteEntry, ResourceRouter, PromptRouter, PromptRouteEntry } from "../src/router.js";
import type { UpstreamManager } from "../src/upstream.js";
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

describe("ProxyServer (SSE)", () => {
  let server: ProxyServer;
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

    server = new ProxyServer({ port, transport: "sse", router, upstream });
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

    server = new ProxyServer({ port, transport: "sse", router, upstream });
    await server.start();

    client = await connectClient(port, "sse");
    const result = await client.listTools();

    expect(result.tools).toHaveLength(0);
  });

  it("tools/call with valid tool resolves and forwards to upstream", async () => {
    const port = getPort();
    const route = makeRouteEntry("@clawmasons/app-github", "github", "create_pr");
    const routes = new Map([["github_create_pr", route]]);
    const router = createMockRouter([route.tool], routes);
    const upstream = createMockUpstream({
      content: [{ type: "text", text: "PR #42 created" }],
    });

    server = new ProxyServer({ port, transport: "sse", router, upstream });
    await server.start();

    client = await connectClient(port, "sse");
    const result = await client.callTool({
      name: "github_create_pr",
      arguments: { title: "Fix bug" },
    });

    expect(result.content).toEqual([{ type: "text", text: "PR #42 created" }]);
    expect(router.resolve).toHaveBeenCalledWith("github_create_pr");
    expect(upstream.callTool).toHaveBeenCalledWith(
      "@clawmasons/app-github",
      "create_pr",
      { title: "Fix bug" },
    );
  });

  it("tools/call with unknown tool returns isError", async () => {
    const port = getPort();
    const router = createMockRouter([], new Map());
    const upstream = createMockUpstream();

    server = new ProxyServer({ port, transport: "sse", router, upstream });
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
    const route = makeRouteEntry("@clawmasons/app-github", "github", "create_pr");
    const routes = new Map([["github_create_pr", route]]);
    const router = createMockRouter([route.tool], routes);
    const upstream = createMockUpstream(
      undefined,
      new Error("Connection refused"),
    );

    server = new ProxyServer({ port, transport: "sse", router, upstream });
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

    server = new ProxyServer({ port, transport: "sse", router, upstream });
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

    server = new ProxyServer({ port: getPort(), transport: "sse", router, upstream });
    await expect(server.stop()).resolves.toBeUndefined();
  });

  it("uses custom port configuration", async () => {
    const port = getPort();
    const router = createMockRouter([], new Map());
    const upstream = createMockUpstream();

    server = new ProxyServer({ port, transport: "sse", router, upstream });
    await server.start();

    client = await connectClient(port, "sse");
    const result = await client.listTools();
    expect(result.tools).toHaveLength(0);
  });
});

// ── Streamable HTTP Transport Tests ─────────────────────────────────

describe("ProxyServer (streamable-http)", () => {
  let server: ProxyServer;
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

    server = new ProxyServer({ port, transport: "streamable-http", router, upstream });
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
    const route = makeRouteEntry("@clawmasons/app-github", "github", "create_pr");
    const routes = new Map([["github_create_pr", route]]);
    const router = createMockRouter([route.tool], routes);
    const upstream = createMockUpstream({
      content: [{ type: "text", text: "PR #42 created" }],
    });

    server = new ProxyServer({ port, transport: "streamable-http", router, upstream });
    await server.start();

    client = await connectClient(port, "streamable-http");
    const result = await client.callTool({
      name: "github_create_pr",
      arguments: { title: "Fix bug" },
    });

    expect(result.content).toEqual([{ type: "text", text: "PR #42 created" }]);
    expect(upstream.callTool).toHaveBeenCalledWith(
      "@clawmasons/app-github",
      "create_pr",
      { title: "Fix bug" },
    );
  });

  it("tools/call with unknown tool returns isError", async () => {
    const port = getPort();
    const router = createMockRouter([], new Map());
    const upstream = createMockUpstream();

    server = new ProxyServer({ port, transport: "streamable-http", router, upstream });
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
    const route = makeRouteEntry("@clawmasons/app-github", "github", "create_pr");
    const routes = new Map([["github_create_pr", route]]);
    const router = createMockRouter([route.tool], routes);
    const upstream = createMockUpstream(
      undefined,
      new Error("Timeout waiting for response"),
    );

    server = new ProxyServer({ port, transport: "streamable-http", router, upstream });
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

// ── Auth + Health Endpoint Tests ─────────────────────────────────────

describe("ProxyServer (auth)", () => {
  let server: ProxyServer;
  let client: Client;

  afterEach(async () => {
    try { await client?.close(); } catch { /* ignore */ }
    try { await server?.stop(); } catch { /* ignore */ }
  });

  it("/health responds 200 without auth", async () => {
    const port = getPort();
    const router = createMockRouter([], new Map());
    const upstream = createMockUpstream();

    server = new ProxyServer({
      port, transport: "streamable-http", router, upstream, authToken: "secret",
    });
    await server.start();

    const resp = await fetch(`http://localhost:${port}/health`);
    expect(resp.status).toBe(200);
    expect(await resp.text()).toBe("ok");
  });

  it("rejects MCP requests when authToken is set and no Authorization header", async () => {
    const port = getPort();
    const router = createMockRouter([], new Map());
    const upstream = createMockUpstream();

    server = new ProxyServer({
      port, transport: "streamable-http", router, upstream, authToken: "secret",
    });
    await server.start();

    const resp = await fetch(`http://localhost:${port}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 1, params: {} }),
    });
    expect(resp.status).toBe(401);
  });

  it("rejects MCP requests with wrong token", async () => {
    const port = getPort();
    const router = createMockRouter([], new Map());
    const upstream = createMockUpstream();

    server = new ProxyServer({
      port, transport: "streamable-http", router, upstream, authToken: "secret",
    });
    await server.start();

    const resp = await fetch(`http://localhost:${port}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer wrong-token",
      },
      body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 1, params: {} }),
    });
    expect(resp.status).toBe(401);
  });

  it("allows MCP requests with correct token", async () => {
    const port = getPort();
    const tools = [makeTool("test_tool")];
    const router = createMockRouter(tools, new Map());
    const upstream = createMockUpstream();

    server = new ProxyServer({
      port, transport: "streamable-http", router, upstream, authToken: "my-secret",
    });
    await server.start();

    client = new Client({ name: "auth-test", version: "0.1.0" });
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://localhost:${port}/mcp`),
      {
        requestInit: {
          headers: { Authorization: "Bearer my-secret" },
        },
      },
    );
    await client.connect(transport);

    const result = await client.listTools();
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0]!.name).toBe("test_tool");
  });

  it("allows all MCP requests when no authToken configured", async () => {
    const port = getPort();
    const tools = [makeTool("open_tool")];
    const router = createMockRouter(tools, new Map());
    const upstream = createMockUpstream();

    server = new ProxyServer({
      port, transport: "streamable-http", router, upstream,
    });
    await server.start();

    client = await connectClient(port, "streamable-http");
    const result = await client.listTools();
    expect(result.tools).toHaveLength(1);
  });

  it("auth works with SSE transport", async () => {
    const port = getPort();
    const router = createMockRouter([], new Map());
    const upstream = createMockUpstream();

    server = new ProxyServer({
      port, transport: "sse", router, upstream, authToken: "sse-secret",
    });
    await server.start();

    // Without token — should get 401
    const resp = await fetch(`http://localhost:${port}/sse`);
    expect(resp.status).toBe(401);
  });
});

// ── Audit Logging Integration Tests ──────────────────────────────────

describe("ProxyServer (audit logging)", () => {
  let server: ProxyServer;
  let client: Client;

  afterEach(async () => {
    try { await client?.close(); } catch { /* ignore */ }
    try { await server?.stop(); } catch { /* ignore */ }
  });

  it("does not crash when no relay is configured (no audit logging)", async () => {
    const port = getPort();
    const route = makeRouteEntry("@clawmasons/app-github", "github", "create_pr");
    const routes = new Map([["github_create_pr", route]]);
    const router = createMockRouter([route.tool], routes);
    const upstream = createMockUpstream({
      content: [{ type: "text", text: "ok" }],
    });

    // No relayToken provided — no relay server, no audit
    server = new ProxyServer({ port, transport: "sse", router, upstream });
    await server.start();

    client = await connectClient(port, "sse");
    const result = await client.callTool({
      name: "github_create_pr",
      arguments: {},
    });

    expect(result.content).toEqual([{ type: "text", text: "ok" }]);
  });
});

// ── Approval Workflow Tests ──────────────────────────────────────────
// Note: Full approval via relay is Change 7. These tests verify the server
// correctly gates tool calls on approval patterns when a relay is available.
// The approval hook now sends approval_request via relay.request().

describe("ProxyServer (approval workflow)", () => {
  let server: ProxyServer;
  let client: Client;

  afterEach(async () => {
    try { await client?.close(); } catch { /* ignore */ }
    try { await server?.stop(); } catch { /* ignore */ }
  });

  it("tool not matching approval patterns proceeds without approval", async () => {
    const port = getPort();
    const route = makeRouteEntry("@clawmasons/app-github", "github", "list_repos");
    const routes = new Map([["github_list_repos", route]]);
    const router = createMockRouter([route.tool], routes);
    const upstream = createMockUpstream({
      content: [{ type: "text", text: "repos listed" }],
    });

    server = new ProxyServer({
      port,
      transport: "sse",
      router,
      upstream,
      agentName: "note-taker",
      relayToken: "test-token",
      approvalPatterns: ["github_delete_*"],
      approvalOptions: { ttlSeconds: 5 },
    });
    await server.start();

    client = await connectClient(port, "sse");

    const result = await client.callTool({
      name: "github_list_repos",
      arguments: {},
    });

    expect(result.content).toEqual([{ type: "text", text: "repos listed" }]);
    expect(upstream.callTool).toHaveBeenCalled();
  });
});

// ── Resource Passthrough Tests ──────────────────────────────────────

describe("ProxyServer (resources)", () => {
  let server: ProxyServer;
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

    server = new ProxyServer({ port, transport: "sse", router, upstream, resourceRouter });
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
      ["repo://owner/name", { appName: "@clawmasons/app-github", originalUri: "repo://owner/name" }],
    ]);
    const resourceRouter = createMockResourceRouter([], uriMap);
    const router = createMockRouter([], new Map());
    const upstream = createMockUpstream();

    server = new ProxyServer({ port, transport: "sse", router, upstream, resourceRouter });
    await server.start();

    client = await connectClient(port, "sse");
    const result = await client.readResource({ uri: "repo://owner/name" });

    expect(result.contents).toHaveLength(1);
    expect((result.contents[0] as { text: string }).text).toBe("resource data");
    expect(upstream.readResource).toHaveBeenCalledWith("@clawmasons/app-github", "repo://owner/name");
  });

  it("resources/read with unknown URI returns error", async () => {
    const port = getPort();
    const resourceRouter = createMockResourceRouter([], new Map());
    const router = createMockRouter([], new Map());
    const upstream = createMockUpstream();

    server = new ProxyServer({ port, transport: "sse", router, upstream, resourceRouter });
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

    server = new ProxyServer({ port, transport: "streamable-http", router, upstream, resourceRouter });
    await server.start();

    client = await connectClient(port, "streamable-http");
    const result = await client.listResources();

    expect(result.resources).toHaveLength(1);
    expect(result.resources[0]!.name).toBe("slack_channel");
  });
});

// ── Prompt Passthrough Tests ────────────────────────────────────────

describe("ProxyServer (prompts)", () => {
  let server: ProxyServer;
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

    server = new ProxyServer({ port, transport: "sse", router, upstream, promptRouter });
    await server.start();

    client = await connectClient(port, "sse");
    const result = await client.listPrompts();

    expect(result.prompts).toHaveLength(1);
    expect(result.prompts[0]!.name).toBe("github_pr_review");
  });

  it("prompts/get with valid name forwards to upstream", async () => {
    const port = getPort();
    const entry: PromptRouteEntry = {
      appName: "@clawmasons/app-github",
      appShortName: "github",
      originalName: "pr_review",
      prefixedName: "github_pr_review",
      prompt: makePromptObj("github_pr_review"),
    };
    const routes = new Map([["github_pr_review", entry]]);
    const promptRouter = createMockPromptRouter([entry.prompt], routes);
    const router = createMockRouter([], new Map());
    const upstream = createMockUpstream();

    server = new ProxyServer({ port, transport: "sse", router, upstream, promptRouter });
    await server.start();

    client = await connectClient(port, "sse");
    const result = await client.getPrompt({ name: "github_pr_review", arguments: { pr_number: "42" } });

    expect(result.messages).toHaveLength(1);
    expect(upstream.getPrompt).toHaveBeenCalledWith(
      "@clawmasons/app-github",
      "pr_review",
      { pr_number: "42" },
    );
  });

  it("prompts/get with unknown name returns error", async () => {
    const port = getPort();
    const promptRouter = createMockPromptRouter([], new Map());
    const router = createMockRouter([], new Map());
    const upstream = createMockUpstream();

    server = new ProxyServer({ port, transport: "sse", router, upstream, promptRouter });
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

    server = new ProxyServer({ port, transport: "streamable-http", router, upstream, promptRouter });
    await server.start();

    client = await connectClient(port, "streamable-http");
    const result = await client.listPrompts();

    expect(result.prompts).toHaveLength(1);
    expect(result.prompts[0]!.name).toBe("slack_standup");
  });
});

// ── Ready Gate Tests ─────────────────────────────────────────────────

describe("ProxyServer (readyGate)", () => {
  let server: ProxyServer;
  let client: Client;

  afterEach(async () => {
    try { await client?.close(); } catch { /* */ }
    try { await server?.stop(); } catch { /* */ }
  });

  it("health endpoint works before readyGate resolves", async () => {
    const port = getPort();
    let resolveReady!: () => void;
    const readyGate = new Promise<void>((r) => { resolveReady = r; });

    const router = createMockRouter([], new Map());
    const upstream = createMockUpstream();

    server = new ProxyServer({ port, transport: "streamable-http", router, upstream, readyGate });
    await server.start();

    // Health should respond immediately
    const resp = await fetch(`http://localhost:${port}/health`);
    expect(resp.status).toBe(200);
    expect(await resp.text()).toBe("ok");

    resolveReady();
  });

  it("listTools blocks until readyGate resolves, then returns full list", async () => {
    const port = getPort();
    let resolveReady!: () => void;
    const readyGate = new Promise<void>((r) => { resolveReady = r; });

    const tools = [makeTool("github_create_pr")];
    const router = createMockRouter(tools, new Map());
    const upstream = createMockUpstream();

    server = new ProxyServer({
      port, transport: "streamable-http", router, upstream, readyGate,
      relayToken: "test-relay-token",
    });
    await server.start();

    client = await connectClient(port, "streamable-http");

    // listTools should block until the gate resolves — resolve it after a short delay
    setTimeout(() => resolveReady(), 50);

    const result = await client.listTools();
    expect(result.tools.length).toBeGreaterThanOrEqual(2);
    const names = result.tools.map((t) => t.name);
    expect(names).toContain("github_create_pr");
    expect(names).toContain("credential_request");
  });

  it("listTools returns full tool list after readyGate resolves", async () => {
    const port = getPort();
    let resolveReady!: () => void;
    const readyGate = new Promise<void>((r) => { resolveReady = r; });

    const tools = [makeTool("github_create_pr"), makeTool("slack_send")];
    const router = createMockRouter(tools, new Map());
    const upstream = createMockUpstream();

    server = new ProxyServer({
      port, transport: "streamable-http", router, upstream, readyGate,
      relayToken: "test-relay-token",
    });
    await server.start();

    // Resolve the gate before connecting
    resolveReady();

    client = await connectClient(port, "streamable-http");
    const result = await client.listTools();

    // After ready: upstream tools + credential_request
    expect(result.tools).toHaveLength(3);
    const names = result.tools.map((t) => t.name);
    expect(names).toContain("github_create_pr");
    expect(names).toContain("slack_send");
    expect(names).toContain("credential_request");
  });

  it("callTool for upstream tools blocks until readyGate resolves", async () => {
    const port = getPort();
    let resolveReady!: () => void;
    const readyGate = new Promise<void>((r) => { resolveReady = r; });

    const route = makeRouteEntry("@clawmasons/app-github", "github", "create_pr");
    const routes = new Map([["github_create_pr", route]]);
    const router = createMockRouter([route.tool], routes);
    const upstream = createMockUpstream({ content: [{ type: "text", text: "PR created" }] });

    server = new ProxyServer({ port, transport: "streamable-http", router, upstream, readyGate });
    await server.start();

    client = await connectClient(port, "streamable-http");

    // Start the tool call — it should block on readyGate
    let resolved = false;
    const callPromise = client.callTool({ name: "github_create_pr", arguments: {} }).then((r) => {
      resolved = true;
      return r;
    });

    // Give it a tick — should still be pending
    await new Promise((r) => setTimeout(r, 50));
    expect(resolved).toBe(false);

    // Now resolve the gate
    resolveReady();
    const result = await callPromise;
    expect(resolved).toBe(true);
    expect((upstream as unknown as { callTool: ReturnType<typeof vi.fn> }).callTool).toHaveBeenCalled();
    expect(result.content).toEqual([{ type: "text", text: "PR created" }]);
  });

  it("setRouting updates router after construction", async () => {
    const port = getPort();
    let resolveReady!: () => void;
    const readyGate = new Promise<void>((r) => { resolveReady = r; });

    // Start with empty router
    const emptyRouter = createMockRouter([], new Map());
    const upstream = createMockUpstream();

    server = new ProxyServer({ port, transport: "streamable-http", router: emptyRouter, upstream, readyGate });
    await server.start();

    // Update routing and resolve gate
    const tools = [makeTool("github_create_pr")];
    const fullRouter = createMockRouter(tools, new Map());
    server.setRouting({ router: fullRouter });
    resolveReady();
    await new Promise((r) => setTimeout(r, 10));

    client = await connectClient(port, "streamable-http");
    const result = await client.listTools();

    // Should use the updated router
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0]!.name).toBe("github_create_pr");
  });
});
