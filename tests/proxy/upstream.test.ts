import { describe, it, expect, vi, beforeEach } from "vitest";
import { UpstreamManager, createTransport } from "../../src/proxy/upstream.js";
import type { UpstreamAppConfig } from "../../src/proxy/upstream.js";
import type { ResolvedApp } from "../../src/resolver/types.js";

// ── Mock MCP SDK ────────────────────────────────────────────────────────

const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn().mockResolvedValue(undefined);
const mockListTools = vi.fn().mockResolvedValue({
  tools: [
    { name: "create_pr", description: "Create a PR", inputSchema: { type: "object" } },
    { name: "list_repos", description: "List repos", inputSchema: { type: "object" } },
  ],
  nextCursor: undefined,
});
const mockListResources = vi.fn().mockResolvedValue({
  resources: [
    { uri: "repo://owner/name", name: "repository", description: "A repo" },
  ],
  nextCursor: undefined,
});
const mockListPrompts = vi.fn().mockResolvedValue({
  prompts: [
    { name: "pr_review", description: "Review a PR" },
  ],
  nextCursor: undefined,
});
const mockCallTool = vi.fn().mockResolvedValue({
  content: [{ type: "text", text: "PR created" }],
});
const mockReadResource = vi.fn().mockResolvedValue({
  contents: [{ uri: "repo://owner/name", text: "repo data", mimeType: "text/plain" }],
});
const mockGetPrompt = vi.fn().mockResolvedValue({
  messages: [{ role: "user", content: { type: "text", text: "Review this PR" } }],
});

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: mockConnect,
    close: mockClose,
    listTools: mockListTools,
    listResources: mockListResources,
    listPrompts: mockListPrompts,
    callTool: mockCallTool,
    readResource: mockReadResource,
    getPrompt: mockGetPrompt,
  })),
}));

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: vi.fn().mockImplementation((params: unknown) => ({
    type: "stdio",
    params,
  })),
}));

vi.mock("@modelcontextprotocol/sdk/client/sse.js", () => ({
  SSEClientTransport: vi.fn().mockImplementation((url: unknown) => ({
    type: "sse",
    url,
  })),
}));

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: vi.fn().mockImplementation((url: unknown) => ({
    type: "streamableHttp",
    url,
  })),
}));

// ── Fixtures ────────────────────────────────────────────────────────────

function makeStdioApp(overrides?: Partial<ResolvedApp>): ResolvedApp {
  return {
    name: "@clawforge/app-github",
    version: "1.0.0",
    transport: "stdio",
    command: "node",
    args: ["server.js"],
    tools: ["create_pr", "list_repos"],
    capabilities: ["tools"],
    ...overrides,
  };
}

function makeSseApp(overrides?: Partial<ResolvedApp>): ResolvedApp {
  return {
    name: "@clawforge/app-slack",
    version: "1.0.0",
    transport: "sse",
    url: "http://localhost:3000/sse",
    tools: ["send_message"],
    capabilities: ["tools"],
    ...overrides,
  };
}

function makeStreamableApp(overrides?: Partial<ResolvedApp>): ResolvedApp {
  return {
    name: "@clawforge/app-atlassian",
    version: "1.0.0",
    transport: "streamable-http",
    url: "http://localhost:4000/mcp",
    tools: ["create_issue"],
    capabilities: ["tools"],
    ...overrides,
  };
}

function makeConfigs(): UpstreamAppConfig[] {
  return [
    { name: "github", app: makeStdioApp(), env: { GITHUB_TOKEN: "ghp_test" } },
    { name: "slack", app: makeSseApp() },
    { name: "atlassian", app: makeStreamableApp() },
  ];
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("proxy/upstream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createTransport", () => {
    it("creates StdioClientTransport for stdio apps", () => {
      const config: UpstreamAppConfig = {
        name: "github",
        app: makeStdioApp(),
        env: { GITHUB_TOKEN: "ghp_test" },
      };
      const transport = createTransport(config);
      expect(transport).toHaveProperty("type", "stdio");
    });

    it("creates SSEClientTransport for sse apps", () => {
      const config: UpstreamAppConfig = {
        name: "slack",
        app: makeSseApp(),
      };
      const transport = createTransport(config);
      expect(transport).toHaveProperty("type", "sse");
    });

    it("creates StreamableHTTPClientTransport for streamable-http apps", () => {
      const config: UpstreamAppConfig = {
        name: "atlassian",
        app: makeStreamableApp(),
      };
      const transport = createTransport(config);
      expect(transport).toHaveProperty("type", "streamableHttp");
    });

    it("throws for stdio app without command", () => {
      const config: UpstreamAppConfig = {
        name: "broken",
        app: makeStdioApp({ command: undefined }),
      };
      expect(() => createTransport(config)).toThrow(
        'App "broken" has transport "stdio" but no command specified',
      );
    });

    it("throws for sse app without url", () => {
      const config: UpstreamAppConfig = {
        name: "broken",
        app: makeSseApp({ url: undefined }),
      };
      expect(() => createTransport(config)).toThrow(
        'App "broken" has transport "sse" but no url specified',
      );
    });

    it("throws for streamable-http app without url", () => {
      const config: UpstreamAppConfig = {
        name: "broken",
        app: makeStreamableApp({ url: undefined }),
      };
      expect(() => createTransport(config)).toThrow(
        'App "broken" has transport "streamable-http" but no url specified',
      );
    });
  });

  describe("UpstreamManager", () => {
    describe("constructor", () => {
      it("stores configs without connecting", () => {
        const configs = makeConfigs();
        const manager = new UpstreamManager(configs);
        expect(manager).toBeDefined();
        expect(mockConnect).not.toHaveBeenCalled();
      });
    });

    describe("initialize", () => {
      it("connects all clients in parallel", async () => {
        const configs = makeConfigs();
        const manager = new UpstreamManager(configs);
        await manager.initialize();
        expect(mockConnect).toHaveBeenCalledTimes(3);
      });

      it("throws on connection failure", async () => {
        mockConnect.mockRejectedValueOnce(new Error("Connection refused"));
        const configs: UpstreamAppConfig[] = [
          { name: "broken", app: makeStdioApp() },
        ];
        const manager = new UpstreamManager(configs);
        await expect(manager.initialize()).rejects.toThrow("Connection refused");
      });

      it("throws on timeout", async () => {
        mockConnect.mockImplementationOnce(
          () => new Promise((resolve) => setTimeout(resolve, 5000)),
        );
        const configs: UpstreamAppConfig[] = [
          { name: "slow-app", app: makeStdioApp() },
        ];
        const manager = new UpstreamManager(configs);
        await expect(manager.initialize(100)).rejects.toThrow(
          /timed out after 100ms.*slow-app/,
        );
      });
    });

    describe("getTools", () => {
      it("returns tools from the correct upstream", async () => {
        const configs = makeConfigs();
        const manager = new UpstreamManager(configs);
        await manager.initialize();

        const tools = await manager.getTools("github");
        expect(tools).toHaveLength(2);
        expect(tools[0].name).toBe("create_pr");
        expect(tools[1].name).toBe("list_repos");
      });

      it("handles pagination", async () => {
        mockListTools
          .mockResolvedValueOnce({
            tools: [{ name: "tool_a", inputSchema: { type: "object" } }],
            nextCursor: "page2",
          })
          .mockResolvedValueOnce({
            tools: [{ name: "tool_b", inputSchema: { type: "object" } }],
            nextCursor: undefined,
          });

        const configs: UpstreamAppConfig[] = [
          { name: "paginated", app: makeStdioApp() },
        ];
        const manager = new UpstreamManager(configs);
        await manager.initialize();

        const tools = await manager.getTools("paginated");
        expect(tools).toHaveLength(2);
        expect(tools[0].name).toBe("tool_a");
        expect(tools[1].name).toBe("tool_b");
        expect(mockListTools).toHaveBeenCalledTimes(2);
      });

      it("throws for unknown app", async () => {
        const manager = new UpstreamManager([]);
        await manager.initialize();

        await expect(manager.getTools("nonexistent")).rejects.toThrow(
          "Unknown app: nonexistent",
        );
      });
    });

    describe("getResources", () => {
      it("returns resources from the correct upstream", async () => {
        const configs = makeConfigs();
        const manager = new UpstreamManager(configs);
        await manager.initialize();

        const resources = await manager.getResources("github");
        expect(resources).toHaveLength(1);
        expect(resources[0].name).toBe("repository");
      });

      it("throws for unknown app", async () => {
        const manager = new UpstreamManager([]);
        await manager.initialize();

        await expect(manager.getResources("nonexistent")).rejects.toThrow(
          "Unknown app: nonexistent",
        );
      });
    });

    describe("getPrompts", () => {
      it("returns prompts from the correct upstream", async () => {
        const configs = makeConfigs();
        const manager = new UpstreamManager(configs);
        await manager.initialize();

        const prompts = await manager.getPrompts("github");
        expect(prompts).toHaveLength(1);
        expect(prompts[0].name).toBe("pr_review");
      });

      it("throws for unknown app", async () => {
        const manager = new UpstreamManager([]);
        await manager.initialize();

        await expect(manager.getPrompts("nonexistent")).rejects.toThrow(
          "Unknown app: nonexistent",
        );
      });
    });

    describe("callTool", () => {
      it("forwards tool call to the correct upstream", async () => {
        const configs = makeConfigs();
        const manager = new UpstreamManager(configs);
        await manager.initialize();

        const result = await manager.callTool("github", "create_pr", {
          title: "fix",
        });
        expect(result.content).toHaveLength(1);
        expect(mockCallTool).toHaveBeenCalledWith({
          name: "create_pr",
          arguments: { title: "fix" },
        });
      });

      it("throws for unknown app", async () => {
        const manager = new UpstreamManager([]);
        await manager.initialize();

        await expect(
          manager.callTool("nonexistent", "some_tool", {}),
        ).rejects.toThrow("Unknown app: nonexistent");
      });
    });

    describe("readResource", () => {
      it("forwards resource read to the correct upstream", async () => {
        const configs = makeConfigs();
        const manager = new UpstreamManager(configs);
        await manager.initialize();

        const result = await manager.readResource(
          "github",
          "repo://owner/name",
        );
        expect(result.contents).toHaveLength(1);
        expect(mockReadResource).toHaveBeenCalledWith({
          uri: "repo://owner/name",
        });
      });
    });

    describe("getPrompt (forward)", () => {
      it("forwards prompt get to the correct upstream", async () => {
        const configs = makeConfigs();
        const manager = new UpstreamManager(configs);
        await manager.initialize();

        const result = await manager.getPrompt("github", "pr_review", {
          code: "...",
        });
        expect(result.messages).toHaveLength(1);
        expect(mockGetPrompt).toHaveBeenCalledWith({
          name: "pr_review",
          arguments: { code: "..." },
        });
      });
    });

    describe("shutdown", () => {
      it("closes all clients", async () => {
        const configs = makeConfigs();
        const manager = new UpstreamManager(configs);
        await manager.initialize();

        await manager.shutdown();
        expect(mockClose).toHaveBeenCalledTimes(3);
      });

      it("swallows errors from individual client close", async () => {
        mockClose
          .mockRejectedValueOnce(new Error("close failed"))
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce(undefined);

        const configs = makeConfigs();
        const manager = new UpstreamManager(configs);
        await manager.initialize();

        // Should not throw despite one client failing to close
        await expect(manager.shutdown()).resolves.toBeUndefined();
        expect(mockClose).toHaveBeenCalledTimes(3);
      });

      it("throws for unknown app after shutdown", async () => {
        const configs = makeConfigs();
        const manager = new UpstreamManager(configs);
        await manager.initialize();
        await manager.shutdown();

        await expect(manager.getTools("github")).rejects.toThrow(
          "Unknown app: github",
        );
      });
    });
  });
});
