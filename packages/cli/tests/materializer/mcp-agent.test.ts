import { describe, expect, it } from "vitest";
import { mcpAgentMaterializer } from "@clawmasons/mcp-agent/agent-package";
import { ACP_RUNTIME_COMMANDS } from "../../src/materializer/common.js";
import type { ResolvedAgent, ResolvedApp, ResolvedRole } from "@clawmasons/shared";

function makeFilesystemApp(): ResolvedApp {
  return {
    name: "@clawmasons/app-filesystem",
    version: "1.0.0",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"],
    tools: ["read_file", "write_file", "list_directory"],
    capabilities: ["tools"],
    credentials: [],
  };
}

function makeMcpTestAgent(): ResolvedAgent {
  const filesystemApp = makeFilesystemApp();

  const testRole: ResolvedRole = {
    name: "@clawmasons/role-mcp-test",
    version: "1.0.0",
    description: "Test role for MCP agent.",
    risk: "LOW",
    permissions: {
      "@clawmasons/app-filesystem": {
        allow: ["read_file", "write_file", "list_directory"],
        deny: [],
      },
    },
    tasks: [],
    apps: [filesystemApp],
    skills: [],
  };

  return {
    name: "@clawmasons/agent-mcp-test",
    version: "1.0.0",
    agentName: "MCP Test",
    slug: "mcp-test",
    description: "MCP test agent for debugging.",
    runtimes: ["node"],
    credentials: [],
    roles: [testRole],
    proxy: {
      port: 3000,
      type: "sse",
    },
  };
}

describe("mcpAgentMaterializer", () => {
  it("has name 'mcp-agent'", () => {
    expect(mcpAgentMaterializer.name).toBe("mcp-agent");
  });

  describe("materializeWorkspace", () => {
    describe(".mcp.json", () => {
      it("generates single mason entry with SSE proxy", () => {
        const agent = makeMcpTestAgent();
        const result = mcpAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:3000");

        const mcpJson = result.get(".mcp.json");
        expect(mcpJson).toBeDefined();

        const mcp = JSON.parse(mcpJson!);
        expect(mcp.mcpServers.mason).toBeDefined();
        expect(mcp.mcpServers.mason.type).toBe("sse");
        expect(mcp.mcpServers.mason.url).toBe("http://mcp-proxy:3000/sse");
        expect(Object.keys(mcp.mcpServers)).toEqual(["mason"]);
      });

      it("generates mason entry with streamable-http transport", () => {
        const agent = makeMcpTestAgent();
        agent.proxy = { port: 3000, type: "streamable-http" };
        const result = mcpAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:3000");

        const mcp = JSON.parse(result.get(".mcp.json")!);
        expect(mcp.mcpServers.mason.type).toBe("streamable-http");
        expect(mcp.mcpServers.mason.url).toBe("http://mcp-proxy:3000/mcp");
      });

      it("includes placeholder auth header when no token provided", () => {
        const agent = makeMcpTestAgent();
        const result = mcpAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:3000");

        const mcp = JSON.parse(result.get(".mcp.json")!);
        expect(mcp.mcpServers.mason.headers.Authorization).toBe("Bearer ${MCP_PROXY_TOKEN}");
      });

      it("bakes actual token into auth header when proxyToken provided", () => {
        const agent = makeMcpTestAgent();
        const token = "test-token-123";
        const result = mcpAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:3000", token);

        const mcp = JSON.parse(result.get(".mcp.json")!);
        expect(mcp.mcpServers.mason.headers.Authorization).toBe("Bearer test-token-123");
      });
    });

    describe("agent-launch.json", () => {
      it("generates agent-launch.json with mcp-agent command", () => {
        const agent = makeMcpTestAgent();
        const result = mcpAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:3000");

        const launchJson = result.get("agent-launch.json");
        expect(launchJson).toBeDefined();

        const config = JSON.parse(launchJson!);
        expect(config.command).toBe("mcp-agent");
      });

      it("includes role-declared credentials as env type", () => {
        const agent = makeMcpTestAgent();
        agent.credentials = ["TEST_TOKEN"];
        const result = mcpAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:3000");

        const config = JSON.parse(result.get("agent-launch.json")!);
        const cred = config.credentials.find((c: { key: string }) => c.key === "TEST_TOKEN");
        expect(cred).toBeDefined();
        expect(cred.type).toBe("env");
      });

      it("uses ACP command when acpMode is true", () => {
        const agent = makeMcpTestAgent();
        const result = mcpAgentMaterializer.materializeWorkspace(
          agent, "http://mcp-proxy:3000", undefined, { acpMode: true },
        );

        const config = JSON.parse(result.get("agent-launch.json")!);
        expect(config.command).toBe("mcp-agent");
        expect(config.args).toEqual(["--acp"]);
      });
    });

    describe("result completeness", () => {
      it("contains .mcp.json and agent-launch.json", () => {
        const agent = makeMcpTestAgent();
        const result = mcpAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:3000");

        const keys = [...result.keys()].sort();
        expect(keys).toEqual([".mcp.json", "agent-launch.json"]);
      });

      it("does not generate slash commands or IDE settings", () => {
        const agent = makeMcpTestAgent();
        const result = mcpAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:3000");

        const keys = [...result.keys()];
        expect(keys.some((k) => k.includes(".claude/"))).toBe(false);
        expect(keys.some((k) => k.includes(".pi/"))).toBe(false);
        expect(keys.some((k) => k.includes("commands/"))).toBe(false);
      });

      it("does not generate .mason/acp.json even in ACP mode", () => {
        const agent = makeMcpTestAgent();
        const result = mcpAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:3000", undefined, { acpMode: true });

        expect(result.has(".mason/acp.json")).toBe(false);
      });
    });
  });

  describe("ACP_RUNTIME_COMMANDS", () => {
    it("maps claude-code-agent to claude-agent-acp", () => {
      expect(ACP_RUNTIME_COMMANDS["claude-code-agent"]).toBe("claude-agent-acp");
    });

    it("maps pi-coding-agent to pi-agent-acp", () => {
      expect(ACP_RUNTIME_COMMANDS["pi-coding-agent"]).toBe("pi-agent-acp");
    });

    it("maps node to node src/index.js --acp", () => {
      expect(ACP_RUNTIME_COMMANDS["node"]).toBe("node src/index.js --acp");
    });

    it("maps mcp-agent to mcp-agent --acp", () => {
      expect(ACP_RUNTIME_COMMANDS["mcp-agent"]).toBe("mcp-agent --acp");
    });

    it("contains exactly 4 runtime mappings", () => {
      expect(Object.keys(ACP_RUNTIME_COMMANDS)).toHaveLength(4);
    });
  });
});
