import { describe, expect, it } from "vitest";
import { mcpAgentMaterializer } from "@clawmasons/mcp-agent/agent-package";
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
      it("generates single chapter entry with SSE proxy", () => {
        const agent = makeMcpTestAgent();
        const result = mcpAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:3000");

        const mcpJson = result.get(".mcp.json");
        expect(mcpJson).toBeDefined();

        const mcp = JSON.parse(mcpJson!);
        expect(mcp.mcpServers.chapter).toBeDefined();
        expect(mcp.mcpServers.chapter.type).toBe("sse");
        expect(mcp.mcpServers.chapter.url).toBe("http://mcp-proxy:3000/sse");
        expect(Object.keys(mcp.mcpServers)).toEqual(["chapter"]);
      });

      it("generates chapter entry with streamable-http transport", () => {
        const agent = makeMcpTestAgent();
        agent.proxy = { port: 3000, type: "streamable-http" };
        const result = mcpAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:3000");

        const mcp = JSON.parse(result.get(".mcp.json")!);
        expect(mcp.mcpServers.chapter.type).toBe("streamable-http");
        expect(mcp.mcpServers.chapter.url).toBe("http://mcp-proxy:3000/mcp");
      });

      it("includes placeholder auth header when no token provided", () => {
        const agent = makeMcpTestAgent();
        const result = mcpAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:3000");

        const mcp = JSON.parse(result.get(".mcp.json")!);
        expect(mcp.mcpServers.chapter.headers.Authorization).toBe("Bearer ${MCP_PROXY_TOKEN}");
      });

      it("bakes actual token into auth header when proxyToken provided", () => {
        const agent = makeMcpTestAgent();
        const token = "test-token-123";
        const result = mcpAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:3000", token);

        const mcp = JSON.parse(result.get(".mcp.json")!);
        expect(mcp.mcpServers.chapter.headers.Authorization).toBe("Bearer test-token-123");
      });
    });

    describe("AGENTS.md", () => {
      it("generates AGENTS.md with agent short name", () => {
        const agent = makeMcpTestAgent();
        const result = mcpAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:3000");

        const agentsMd = result.get("AGENTS.md")!;
        expect(agentsMd).toContain("# Agent: mcp-test");
      });

      it("includes role with permitted tools", () => {
        const agent = makeMcpTestAgent();
        const result = mcpAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:3000");

        const agentsMd = result.get("AGENTS.md")!;
        expect(agentsMd).toContain("### mcp-test");
        expect(agentsMd).toContain("filesystem: read_file, write_file, list_directory");
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
      it("contains .mcp.json, AGENTS.md, and agent-launch.json", () => {
        const agent = makeMcpTestAgent();
        const result = mcpAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:3000");

        const keys = [...result.keys()].sort();
        expect(keys).toEqual([".mcp.json", "AGENTS.md", "agent-launch.json"]);
      });

      it("does not generate slash commands or IDE settings", () => {
        const agent = makeMcpTestAgent();
        const result = mcpAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:3000");

        const keys = [...result.keys()];
        expect(keys.some((k) => k.includes(".claude/"))).toBe(false);
        expect(keys.some((k) => k.includes(".pi/"))).toBe(false);
        expect(keys.some((k) => k.includes("commands/"))).toBe(false);
      });
    });

    describe("ACP mode", () => {
      it("does not generate .chapter/acp.json even in ACP mode", () => {
        const agent = makeMcpTestAgent();
        const result = mcpAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:3000", undefined, { acpMode: true });

        expect(result.has(".chapter/acp.json")).toBe(false);
      });

      it("result completeness in ACP mode — no .chapter/acp.json", () => {
        const agent = makeMcpTestAgent();
        const result = mcpAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:3000", undefined, { acpMode: true });

        const keys = [...result.keys()].sort();
        expect(keys).toEqual([".mcp.json", "AGENTS.md", "agent-launch.json"]);
      });
    });
  });
});
