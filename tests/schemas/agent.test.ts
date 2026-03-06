import { describe, it, expect } from "vitest";
import { agentChapterFieldSchema } from "../../src/schemas/agent.js";

describe("agentChapterFieldSchema", () => {
  it("validates a valid agent", () => {
    const result = agentChapterFieldSchema.safeParse({
      type: "agent",
      runtimes: ["claude-code", "codex"],
      roles: ["@clawmasons/role-issue-manager"],
      proxy: {
        port: 9090,
        type: "sse",
      },
    });
    expect(result.success).toBe(true);
  });

  it("validates agent with resources", () => {
    const result = agentChapterFieldSchema.safeParse({
      type: "agent",
      runtimes: ["claude-code"],
      roles: ["@clawmasons/role-issue-manager"],
      resources: [
        {
          type: "github-repo",
          ref: "clawmasons/openclaw",
          access: "read-write",
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.resources).toHaveLength(1);
      expect(result.data.resources?.[0].ref).toBe("clawmasons/openclaw");
    }
  });

  it("rejects agent missing runtimes", () => {
    const result = agentChapterFieldSchema.safeParse({
      type: "agent",
      roles: ["@clawmasons/role-issue-manager"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects agent with empty runtimes array", () => {
    const result = agentChapterFieldSchema.safeParse({
      type: "agent",
      runtimes: [],
      roles: ["@clawmasons/role-issue-manager"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects agent missing roles", () => {
    const result = agentChapterFieldSchema.safeParse({
      type: "agent",
      runtimes: ["claude-code"],
    });
    expect(result.success).toBe(false);
  });

  it("validates PRD example: @clawmasons/agent-repo-ops", () => {
    const result = agentChapterFieldSchema.safeParse({
      type: "agent",
      description: "Repository operations agent for GitHub.",
      runtimes: ["claude-code", "codex"],
      roles: [
        "@clawmasons/role-issue-manager",
        "@clawmasons/role-pr-reviewer",
      ],
      resources: [
        {
          type: "github-repo",
          ref: "clawmasons/openclaw",
          access: "read-write",
        },
      ],
      proxy: {
        port: 9090,
        type: "sse",
      },
    });
    expect(result.success).toBe(true);
  });

  it("validates agent with proxy defaults omitted", () => {
    const result = agentChapterFieldSchema.safeParse({
      type: "agent",
      runtimes: ["claude-code"],
      roles: ["@clawmasons/role-issue-manager"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.proxy).toBeUndefined();
    }
  });
});
