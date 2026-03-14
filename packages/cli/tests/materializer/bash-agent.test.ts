import { describe, expect, it } from "vitest";
import { bashAgentMaterializer } from "../../src/materializer/bash-agent.js";
import type { ResolvedAgent, ResolvedRole } from "@clawmasons/shared";

function makeBashTestAgent(): ResolvedAgent {
  const debugRole: ResolvedRole = {
    name: "@clawmasons/role-debug",
    version: "1.0.0",
    description: "Interactive debugging shell.",
    risk: "LOW",
    permissions: {},
    tasks: [],
    apps: [],
    skills: [],
  };

  return {
    name: "@clawmasons/agent-bash-debug",
    version: "1.0.0",
    agentName: "Bash Debug",
    slug: "bash-debug",
    description: "Interactive bash shell for debugging.",
    runtimes: ["bash-agent"],
    credentials: [],
    roles: [debugRole],
  };
}

describe("bashAgentMaterializer", () => {
  it("has name 'bash-agent'", () => {
    expect(bashAgentMaterializer.name).toBe("bash-agent");
  });

  describe("materializeWorkspace", () => {
    it("generates agent-launch.json with bash command", () => {
      const agent = makeBashTestAgent();
      const result = bashAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

      const launchJson = result.get("agent-launch.json");
      expect(launchJson).toBeDefined();

      const config = JSON.parse(launchJson!);
      expect(config.command).toBe("bash");
    });

    it("includes security.CLAUDE_CODE_CREDENTIALS as file credential", () => {
      const agent = makeBashTestAgent();
      const result = bashAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

      const config = JSON.parse(result.get("agent-launch.json")!);
      const claudeCred = config.credentials.find(
        (c: { key: string }) => c.key === "security.CLAUDE_CODE_CREDENTIALS",
      );
      expect(claudeCred).toBeDefined();
      expect(claudeCred.type).toBe("file");
      expect(claudeCred.path).toBe("/home/mason/.claude/.credentials.json");
    });

    it("generates AGENTS.md", () => {
      const agent = makeBashTestAgent();
      const result = bashAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

      const agentsMd = result.get("AGENTS.md")!;
      expect(agentsMd).toContain("# Agent: bash-debug");
      expect(agentsMd).toContain("debug");
    });

    it("contains only agent-launch.json and AGENTS.md", () => {
      const agent = makeBashTestAgent();
      const result = bashAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

      const keys = [...result.keys()].sort();
      expect(keys).toEqual(["AGENTS.md", "agent-launch.json"]);
    });

    it("does not generate .mcp.json or IDE settings", () => {
      const agent = makeBashTestAgent();
      const result = bashAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

      expect(result.has(".mcp.json")).toBe(false);
      expect(result.has(".claude/settings.json")).toBe(false);
    });

    it("includes role-declared credentials as env vars", () => {
      const agent = makeBashTestAgent();
      agent.credentials = ["CUSTOM_TOKEN"];
      const result = bashAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

      const config = JSON.parse(result.get("agent-launch.json")!);
      const customCred = config.credentials.find(
        (c: { key: string }) => c.key === "CUSTOM_TOKEN",
      );
      expect(customCred).toBeDefined();
      expect(customCred.type).toBe("env");
    });
  });
});
