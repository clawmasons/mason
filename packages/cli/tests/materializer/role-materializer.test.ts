import { beforeAll, describe, expect, it } from "vitest";
import type { Role } from "@clawmasons/shared";
import {
  materializeForAgent,
  getMaterializer,
  getRegisteredAgentTypes,
  MaterializerError,
  registerAgents,
} from "../../src/materializer/role-materializer.js";
import { mcpAgentMaterializer } from "@clawmasons/mcp-agent/agent-package";
import {
  mockClaudeCodeAgent,
  mockClaudeCodeMaterializer,
  mockPiCodingAgent,
  mockPiCodingAgentMaterializer,
  mockCodexAgent,
} from "../helpers/mock-agent-packages.js";

// Register mock agent packages for test purposes (real packages moved to mason-extensions).
beforeAll(() => {
  registerAgents([mockClaudeCodeAgent, mockPiCodingAgent, mockCodexAgent]);
});

// ---------------------------------------------------------------------------
// Test fixture: a representative Role
// ---------------------------------------------------------------------------

function makeTestRole(): Role {
  return {
    metadata: {
      name: "create-prd",
      description: "Creates product requirements documents",
      version: "1.0.0",
      scope: "acme",
    },
    instructions: "You are a PRD author. Create clear, well-structured product requirements documents.",
    tasks: [
      { name: "define-change" },
      { name: "review-change" },
    ],
    apps: [
      {
        name: "github",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: { GITHUB_TOKEN: "${GITHUB_TOKEN}" },
        tools: {
          allow: ["create_issue", "list_repos", "create_pr"],
          deny: ["delete_repo"],
        },
        credentials: ["GITHUB_TOKEN"],
        location: "proxy",
      },
    ],
    skills: [
      { name: "prd-writing" },
    ],
    container: {
      packages: { apt: ["jq", "curl"], npm: ["typescript"], pip: [] },
      ignore: { paths: [".mason/", ".claude/"] },
      mounts: [],
    },
    governance: {
      risk: "LOW",
      credentials: ["GITHUB_TOKEN", "ANTHROPIC_API_KEY"],
      constraints: {
        maxConcurrentTasks: 3,
        requireApprovalFor: ["create_pr"],
      },
    },
    type: "project" as const,
    sources: [],
    resources: [],
    source: {
      type: "local",
      agentDialect: "claude-code-agent",
      path: "/projects/cool-app/.claude/roles/create-prd",
    },
  };
}

// ---------------------------------------------------------------------------
// Registry tests
// ---------------------------------------------------------------------------

describe("materializer registry", () => {
  describe("getMaterializer", () => {
    it("returns claude-code-agent materializer for 'claude-code-agent'", () => {
      expect(getMaterializer("claude-code-agent")).toBe(mockClaudeCodeMaterializer);
    });

    it("returns pi-coding-agent materializer for 'pi-coding-agent'", () => {
      expect(getMaterializer("pi-coding-agent")).toBe(mockPiCodingAgentMaterializer);
    });

    it("returns mcp-agent materializer for 'mcp-agent'", () => {
      expect(getMaterializer("mcp-agent")).toBe(mcpAgentMaterializer);
    });

    it("returns undefined for unknown agent type", () => {
      expect(getMaterializer("unknown-agent")).toBeUndefined();
    });
  });

  describe("getRegisteredAgentTypes", () => {
    it("includes all four built-in agent types", () => {
      const types = getRegisteredAgentTypes();
      expect(types).toContain("claude-code-agent");
      expect(types).toContain("pi-coding-agent");
      expect(types).toContain("codex-agent");
      expect(types).toContain("mcp-agent");
    });

    it("returns exactly four types", () => {
      expect(getRegisteredAgentTypes()).toHaveLength(4);
    });
  });
});

// ---------------------------------------------------------------------------
// materializeForAgent tests
// ---------------------------------------------------------------------------

describe("materializeForAgent", () => {
  describe("delegates to registered materializer", () => {
    it("calls the materializer and returns its result", () => {
      const role = makeTestRole();
      const result = materializeForAgent(role, "claude-code-agent");

      // Mock materializer returns an empty Map; the important thing is no error
      expect(result).toBeInstanceOf(Map);
    });
  });

  describe("Error handling", () => {
    it("throws MaterializerError for unknown agent type", () => {
      const role = makeTestRole();
      expect(() => materializeForAgent(role, "unknown-agent")).toThrow(MaterializerError);
    });

    it("MaterializerError message includes the unknown type", () => {
      const role = makeTestRole();
      expect(() => materializeForAgent(role, "unknown-agent")).toThrow(
        /No materializer registered for agent type "unknown-agent"/,
      );
    });

    it("MaterializerError message lists registered types", () => {
      const role = makeTestRole();
      try {
        materializeForAgent(role, "unknown-agent");
        expect.unreachable("should have thrown");
      } catch (err) {
        const msg = (err as Error).message;
        expect(msg).toContain("claude-code-agent");
        expect(msg).toContain("mcp-agent");
        expect(msg).toContain("pi-coding-agent");
      }
    });
  });
});
