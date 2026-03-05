import { describe, it, expect } from "vitest";
import { agentForgeFieldSchema } from "../../src/schemas/agent.js";

describe("agentForgeFieldSchema", () => {
  it("validates a valid agent", () => {
    const result = agentForgeFieldSchema.safeParse({
      type: "agent",
      runtimes: ["claude-code", "codex"],
      roles: ["@clawforge/role-issue-manager"],
      proxy: {
        image: "ghcr.io/tbxark/mcp-proxy:latest",
        port: 9090,
        type: "sse",
      },
    });
    expect(result.success).toBe(true);
  });

  it("validates agent with resources", () => {
    const result = agentForgeFieldSchema.safeParse({
      type: "agent",
      runtimes: ["claude-code"],
      roles: ["@clawforge/role-issue-manager"],
      resources: [
        {
          type: "github-repo",
          ref: "clawforge/openclaw",
          access: "read-write",
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.resources).toHaveLength(1);
      expect(result.data.resources?.[0].ref).toBe("clawforge/openclaw");
    }
  });

  it("rejects agent missing runtimes", () => {
    const result = agentForgeFieldSchema.safeParse({
      type: "agent",
      roles: ["@clawforge/role-issue-manager"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects agent with empty runtimes array", () => {
    const result = agentForgeFieldSchema.safeParse({
      type: "agent",
      runtimes: [],
      roles: ["@clawforge/role-issue-manager"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects agent missing roles", () => {
    const result = agentForgeFieldSchema.safeParse({
      type: "agent",
      runtimes: ["claude-code"],
    });
    expect(result.success).toBe(false);
  });

  it("validates PRD example: @clawforge/agent-repo-ops", () => {
    const result = agentForgeFieldSchema.safeParse({
      type: "agent",
      description: "Repository operations agent for GitHub.",
      runtimes: ["claude-code", "codex"],
      roles: [
        "@clawforge/role-issue-manager",
        "@clawforge/role-pr-reviewer",
      ],
      resources: [
        {
          type: "github-repo",
          ref: "clawforge/openclaw",
          access: "read-write",
        },
      ],
      proxy: {
        image: "ghcr.io/tbxark/mcp-proxy:latest",
        port: 9090,
        type: "sse",
      },
    });
    expect(result.success).toBe(true);
  });

  it("validates agent with proxy defaults omitted", () => {
    const result = agentForgeFieldSchema.safeParse({
      type: "agent",
      runtimes: ["claude-code"],
      roles: ["@clawforge/role-issue-manager"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.proxy).toBeUndefined();
    }
  });
});
