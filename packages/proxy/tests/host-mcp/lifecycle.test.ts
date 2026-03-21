import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RelayServer } from "../../src/relay/server.js";
import { HostProxy } from "../../src/host-proxy.js";
import { ToolRouter } from "../../src/router.js";
import type { RelayMessage, McpToolsRegisterMessage, McpToolsRegisteredMessage } from "../../src/relay/messages.js";
import type { ResolvedApp } from "@clawmasons/shared";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

// ── Mock the approval dialog (osascript not available in tests) ─────
vi.mock("../../src/approvals/dialog.js", () => ({
  showApprovalDialog: vi.fn().mockResolvedValue(true),
}));

// ── Mock the MCP Client and transport ───────────────────────────────
// vi.mock is hoisted, so we cannot reference top-level variables inside
// the factory. Use vi.hoisted() to declare mocks that are available.
const { mockClose, mockConnect, mockListTools } = vi.hoisted(() => ({
  mockClose: vi.fn().mockResolvedValue(undefined),
  mockConnect: vi.fn().mockResolvedValue(undefined),
  mockListTools: vi.fn(),
}));

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: mockConnect,
    close: mockClose,
    listTools: mockListTools,
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
let nextPort = 19900;
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

// ── Host MCP Lifecycle Tests ────────────────────────────────────────

describe("Host MCP Server Lifecycle", () => {
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

    tmpDir = mkdtempSync(join(tmpdir(), "host-mcp-test-"));
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

  it("starts host MCP servers, discovers tools, and registers via relay", async () => {
    mockListTools.mockResolvedValue({
      tools: [makeTool("run_simulator"), makeTool("list_devices")],
    });

    proxy = new HostProxy({
      relayUrl: `ws://localhost:${port}/ws/relay`,
      token: "test-token",
      auditFilePath,
      hostApps: [makeHostApp("@acme/app-xcode")],
    });

    await proxy.start();

    // Verify host MCP server tools were registered in the tool router
    const tools = toolRouter.listTools();
    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name).sort()).toEqual([
      "xcode_list_devices",
      "xcode_run_simulator",
    ]);

    // Verify routes are marked as host routes
    const entry = toolRouter.resolve("xcode_run_simulator");
    expect(entry).not.toBeNull();
    expect(entry!.isHostRoute).toBe(true);
    expect(entry!.appName).toBe("@acme/app-xcode");
    expect(entry!.originalToolName).toBe("run_simulator");
  });

  it("handles multiple host apps", async () => {
    mockListTools
      .mockResolvedValueOnce({
        tools: [makeTool("run_simulator")],
      })
      .mockResolvedValueOnce({
        tools: [makeTool("send_message")],
      });

    proxy = new HostProxy({
      relayUrl: `ws://localhost:${port}/ws/relay`,
      token: "test-token",
      auditFilePath,
      hostApps: [makeHostApp("@acme/app-xcode"), makeHostApp("@acme/app-slack")],
    });

    await proxy.start();

    const tools = toolRouter.listTools();
    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name).sort()).toEqual([
      "slack_send_message",
      "xcode_run_simulator",
    ]);
  });

  it("works normally with no host apps", async () => {
    proxy = new HostProxy({
      relayUrl: `ws://localhost:${port}/ws/relay`,
      token: "test-token",
      auditFilePath,
    });

    await proxy.start();
    expect(proxy.isConnected()).toBe(true);
    expect(toolRouter.listTools()).toHaveLength(0);
  });

  it("closes host MCP clients on stop()", async () => {
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
    expect(mockClose).not.toHaveBeenCalled();

    await proxy.stop();
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("skips apps that fail to start and continues with others", async () => {
    mockConnect
      .mockRejectedValueOnce(new Error("spawn failed"))
      .mockResolvedValueOnce(undefined);

    mockListTools.mockResolvedValue({
      tools: [makeTool("send_message")],
    });

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    proxy = new HostProxy({
      relayUrl: `ws://localhost:${port}/ws/relay`,
      token: "test-token",
      auditFilePath,
      hostApps: [makeHostApp("@acme/app-xcode"), makeHostApp("@acme/app-slack")],
    });

    await proxy.start();

    // Only the second app should be registered
    const tools = toolRouter.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0]!.name).toBe("slack_send_message");

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to start host MCP server "@acme/app-xcode"'),
    );

    consoleSpy.mockRestore();
  });

  it("skips apps with no tools discovered", async () => {
    mockListTools.mockResolvedValue({ tools: [] });

    proxy = new HostProxy({
      relayUrl: `ws://localhost:${port}/ws/relay`,
      token: "test-token",
      auditFilePath,
      hostApps: [makeHostApp("@acme/app-xcode")],
    });

    await proxy.start();
    expect(toolRouter.listTools()).toHaveLength(0);
  });

  it("preserves tool descriptions and input schemas during registration", async () => {
    const toolWithSchema: Tool = {
      name: "run_simulator",
      description: "Run the iOS simulator",
      inputSchema: {
        type: "object" as const,
        properties: {
          deviceId: { type: "string", description: "Device ID" },
          appBundle: { type: "string", description: "App bundle ID" },
        },
        required: ["deviceId"],
      },
    };

    mockListTools.mockResolvedValue({
      tools: [toolWithSchema],
    });

    proxy = new HostProxy({
      relayUrl: `ws://localhost:${port}/ws/relay`,
      token: "test-token",
      auditFilePath,
      hostApps: [makeHostApp("@acme/app-xcode")],
    });

    await proxy.start();

    const entry = toolRouter.resolve("xcode_run_simulator");
    expect(entry).not.toBeNull();
    expect(entry!.tool.description).toBe("Run the iOS simulator");
    expect(entry!.tool.inputSchema).toEqual({
      type: "object",
      properties: {
        deviceId: { type: "string", description: "Device ID" },
        appBundle: { type: "string", description: "App bundle ID" },
      },
      required: ["deviceId"],
    });
  });
});
