import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RelayServer } from "../../src/relay/server.js";
import { HostProxy } from "../../src/host-proxy.js";
import { ToolRouter } from "../../src/router.js";
import { createRelayMessage } from "../../src/relay/messages.js";
import type { RelayMessage, McpToolsRegisterMessage, McpToolsRegisteredMessage, McpToolResultMessage } from "../../src/relay/messages.js";
import type { ResolvedApp } from "@clawmasons/shared";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

// ── Mock the approval dialog (osascript not available in tests) ─────
vi.mock("../../src/approvals/dialog.js", () => ({
  showApprovalDialog: vi.fn().mockResolvedValue(true),
}));

// ── Mock the MCP Client and transport ───────────────────────────────
const { mockClose, mockConnect, mockListTools, mockCallTool } = vi.hoisted(() => ({
  mockClose: vi.fn().mockResolvedValue(undefined),
  mockConnect: vi.fn().mockResolvedValue(undefined),
  mockListTools: vi.fn(),
  mockCallTool: vi.fn(),
}));

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: mockConnect,
    close: mockClose,
    listTools: mockListTools,
    callTool: mockCallTool,
  })),
}));

vi.mock("../../src/upstream.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/upstream.js")>();
  return {
    ...original,
    createTransport: vi.fn().mockReturnValue({ start: vi.fn(), close: vi.fn() }),
  };
});

// ── Test port management ────────────────────────────────────────────
let nextPort = 19800;
function getPort(): number {
  return nextPort++;
}

// ── Fixtures ────────────────────────────────────────────────────────

function makeHostApp(name: string): ResolvedApp {
  return {
    name,
    version: "1.0.0",
    transport: "stdio",
    command: "npx",
    args: ["-y", `@acme/${name}-mcp-server`],
    tools: [],
    capabilities: [],
    credentials: [],
    location: "host",
  };
}

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

// ── Host MCP Tool Call Routing Tests ────────────────────────────────

describe("Host MCP Tool Call Routing", () => {
  let relay: RelayServer;
  let httpServer: HttpServer;
  let port: number;
  let proxy: HostProxy;
  let tmpDir: string;
  let auditFilePath: string;
  let toolRouter: ToolRouter;

  beforeEach(async () => {
    vi.clearAllMocks();

    port = getPort();
    toolRouter = new ToolRouter(new Map(), new Map());

    relay = new RelayServer({
      token: "test-token",
      defaultTimeoutMs: 5000,
    });

    // Register mcp_tools_register handler on relay (mirrors ProxyServer behavior)
    relay.registerHandler("mcp_tools_register", (msg: RelayMessage) => {
      const regMsg = msg as McpToolsRegisterMessage;
      const tools: Tool[] = regMsg.tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema as Tool["inputSchema"],
      }));
      toolRouter.addRoutes(regMsg.app_name, tools);

      const confirmation: McpToolsRegisteredMessage = {
        id: regMsg.id,
        type: "mcp_tools_registered",
        app_name: regMsg.app_name,
      };
      relay.send(confirmation);
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

    tmpDir = mkdtempSync(join(tmpdir(), "host-mcp-routing-test-"));
    auditFilePath = join(tmpDir, "audit.jsonl");
  });

  afterEach(async () => {
    if (proxy) {
      await proxy.stop();
    }
    relay.shutdown();
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it("forwards tool call to host MCP server and returns result", async () => {
    // Set up mock: discover tools, then handle tool call
    mockListTools.mockResolvedValue({
      tools: [makeTool("run_simulator")],
    });
    mockCallTool.mockResolvedValue({
      content: [{ type: "text", text: "Simulator started on device-123" }],
    });

    proxy = new HostProxy({
      relayUrl: `ws://localhost:${port}/ws/relay`,
      token: "test-token",
      auditFilePath,
      hostApps: [makeHostApp("@acme/app-xcode")],
    });

    await proxy.start();

    // Verify tools are registered
    expect(toolRouter.listTools()).toHaveLength(1);
    const route = toolRouter.resolve("xcode_run_simulator");
    expect(route).not.toBeNull();
    expect(route!.isHostRoute).toBe(true);

    // Send mcp_tool_call from Docker side via relay
    const toolCallMsg = createRelayMessage("mcp_tool_call", {
      app_name: "@acme/app-xcode",
      tool_name: "run_simulator",
      arguments: { deviceId: "device-123" },
    });

    const response = await relay.request(toolCallMsg, 5000) as McpToolResultMessage;

    expect(response.type).toBe("mcp_tool_result");
    expect(response.id).toBe(toolCallMsg.id);
    expect(response.error).toBeUndefined();
    expect(response.result).toEqual({
      content: [{ type: "text", text: "Simulator started on device-123" }],
    });

    // Verify callTool was called correctly
    expect(mockCallTool).toHaveBeenCalledWith({
      name: "run_simulator",
      arguments: { deviceId: "device-123" },
    });
  });

  it("returns error for unknown app_name", async () => {
    mockListTools.mockResolvedValue({
      tools: [makeTool("run_simulator")],
    });

    proxy = new HostProxy({
      relayUrl: `ws://localhost:${port}/ws/relay`,
      token: "test-token",
      auditFilePath,
      hostApps: [makeHostApp("@acme/app-xcode")],
    });

    await proxy.start();

    // Send tool call for unknown app
    const toolCallMsg = createRelayMessage("mcp_tool_call", {
      app_name: "@acme/app-unknown",
      tool_name: "some_tool",
    });

    const response = await relay.request(toolCallMsg, 5000) as McpToolResultMessage;

    expect(response.type).toBe("mcp_tool_result");
    expect(response.id).toBe(toolCallMsg.id);
    expect(response.error).toContain("Unknown host app");
    expect(response.result).toBeUndefined();
  });

  it("returns error when host MCP server throws", async () => {
    mockListTools.mockResolvedValue({
      tools: [makeTool("run_simulator")],
    });
    mockCallTool.mockRejectedValue(new Error("Simulator crashed"));

    proxy = new HostProxy({
      relayUrl: `ws://localhost:${port}/ws/relay`,
      token: "test-token",
      auditFilePath,
      hostApps: [makeHostApp("@acme/app-xcode")],
    });

    await proxy.start();

    const toolCallMsg = createRelayMessage("mcp_tool_call", {
      app_name: "@acme/app-xcode",
      tool_name: "run_simulator",
      arguments: { deviceId: "device-123" },
    });

    const response = await relay.request(toolCallMsg, 5000) as McpToolResultMessage;

    expect(response.type).toBe("mcp_tool_result");
    expect(response.id).toBe(toolCallMsg.id);
    expect(response.error).toBe("Simulator crashed");
    expect(response.result).toBeUndefined();
  });

  it("handles tool call with no arguments", async () => {
    mockListTools.mockResolvedValue({
      tools: [makeTool("list_devices")],
    });
    mockCallTool.mockResolvedValue({
      content: [{ type: "text", text: '["device-1", "device-2"]' }],
    });

    proxy = new HostProxy({
      relayUrl: `ws://localhost:${port}/ws/relay`,
      token: "test-token",
      auditFilePath,
      hostApps: [makeHostApp("@acme/app-xcode")],
    });

    await proxy.start();

    const toolCallMsg = createRelayMessage("mcp_tool_call", {
      app_name: "@acme/app-xcode",
      tool_name: "list_devices",
    });

    const response = await relay.request(toolCallMsg, 5000) as McpToolResultMessage;

    expect(response.type).toBe("mcp_tool_result");
    expect(response.error).toBeUndefined();
    expect(response.result).toEqual({
      content: [{ type: "text", text: '["device-1", "device-2"]' }],
    });

    expect(mockCallTool).toHaveBeenCalledWith({
      name: "list_devices",
      arguments: undefined,
    });
  });

  it("routes to correct app when multiple host apps are running", async () => {
    mockListTools
      .mockResolvedValueOnce({ tools: [makeTool("run_simulator")] })
      .mockResolvedValueOnce({ tools: [makeTool("send_message")] });

    mockCallTool
      .mockResolvedValueOnce({
        content: [{ type: "text", text: "Message sent" }],
      });

    proxy = new HostProxy({
      relayUrl: `ws://localhost:${port}/ws/relay`,
      token: "test-token",
      auditFilePath,
      hostApps: [makeHostApp("@acme/app-xcode"), makeHostApp("@acme/app-slack")],
    });

    await proxy.start();

    // Call the slack tool (second app)
    const toolCallMsg = createRelayMessage("mcp_tool_call", {
      app_name: "@acme/app-slack",
      tool_name: "send_message",
      arguments: { channel: "#general", text: "Hello" },
    });

    const response = await relay.request(toolCallMsg, 5000) as McpToolResultMessage;

    expect(response.type).toBe("mcp_tool_result");
    expect(response.error).toBeUndefined();
    expect(response.result).toEqual({
      content: [{ type: "text", text: "Message sent" }],
    });
  });
});
