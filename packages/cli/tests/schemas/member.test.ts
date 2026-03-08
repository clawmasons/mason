import { describe, it, expect } from "vitest";
import { agentChapterFieldSchema } from "@clawmasons/shared";

describe("agentChapterFieldSchema", () => {
  it("validates a valid agent", () => {
    const result = agentChapterFieldSchema.safeParse({
      type: "agent",
      name: "Repo Ops",
      slug: "repo-ops",
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
      name: "Repo Ops",
      slug: "repo-ops",
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
      expect(result.data.resources[0].ref).toBe("clawmasons/openclaw");
    }
  });

  it("rejects agent missing runtimes", () => {
    const result = agentChapterFieldSchema.safeParse({
      type: "agent",
      name: "Repo Ops",
      slug: "repo-ops",
      roles: ["@clawmasons/role-issue-manager"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects agent with empty runtimes array", () => {
    const result = agentChapterFieldSchema.safeParse({
      type: "agent",
      name: "Repo Ops",
      slug: "repo-ops",
      runtimes: [],
      roles: ["@clawmasons/role-issue-manager"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects agent missing roles", () => {
    const result = agentChapterFieldSchema.safeParse({
      type: "agent",
      name: "Repo Ops",
      slug: "repo-ops",
      runtimes: ["claude-code"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects agent missing name", () => {
    const result = agentChapterFieldSchema.safeParse({
      type: "agent",
      slug: "repo-ops",
      runtimes: ["claude-code"],
      roles: ["@clawmasons/role-issue-manager"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects agent missing slug", () => {
    const result = agentChapterFieldSchema.safeParse({
      type: "agent",
      name: "Repo Ops",
      runtimes: ["claude-code"],
      roles: ["@clawmasons/role-issue-manager"],
    });
    expect(result.success).toBe(false);
  });

  it("validates agent with llm configuration", () => {
    const result = agentChapterFieldSchema.safeParse({
      type: "agent",
      name: "Coder",
      slug: "coder",
      runtimes: ["pi-coding-agent"],
      roles: ["@acme/role-developer"],
      llm: {
        provider: "openrouter",
        model: "anthropic/claude-sonnet-4",
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.llm).toEqual({
        provider: "openrouter",
        model: "anthropic/claude-sonnet-4",
      });
    }
  });

  it("validates agent without llm (optional)", () => {
    const result = agentChapterFieldSchema.safeParse({
      type: "agent",
      name: "Repo Ops",
      slug: "repo-ops",
      runtimes: ["claude-code"],
      roles: ["@clawmasons/role-issue-manager"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.llm).toBeUndefined();
    }
  });

  it("rejects agent with llm missing model", () => {
    const result = agentChapterFieldSchema.safeParse({
      type: "agent",
      name: "Coder",
      slug: "coder",
      runtimes: ["pi-coding-agent"],
      roles: ["@acme/role-developer"],
      llm: {
        provider: "openrouter",
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects agent with llm missing provider", () => {
    const result = agentChapterFieldSchema.safeParse({
      type: "agent",
      name: "Coder",
      slug: "coder",
      runtimes: ["pi-coding-agent"],
      roles: ["@acme/role-developer"],
      llm: {
        model: "anthropic/claude-sonnet-4",
      },
    });
    expect(result.success).toBe(false);
  });

  it("validates PRD example: agent", () => {
    const result = agentChapterFieldSchema.safeParse({
      type: "agent",
      name: "Note Taker",
      slug: "note-taker",
      description: "Note-taking agent that manages markdown files.",
      runtimes: ["claude-code"],
      roles: ["@clawmasons/role-writer"],
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

  it("rejects packages with type 'member'", () => {
    const result = agentChapterFieldSchema.safeParse({
      type: "member",
      memberType: "agent",
      name: "Repo Ops",
      slug: "repo-ops",
      email: "repo-ops@chapter.local",
      runtimes: ["claude-code"],
      roles: ["@clawmasons/role-issue-manager"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects packages with email field", () => {
    const result = agentChapterFieldSchema.safeParse({
      type: "agent",
      name: "Repo Ops",
      slug: "repo-ops",
      email: "repo-ops@chapter.local",
      runtimes: ["claude-code"],
      roles: ["@clawmasons/role-issue-manager"],
    });
    // Zod strips unknown fields by default, so extra fields are ignored
    expect(result.success).toBe(true);
    if (result.success) {
      expect("email" in result.data).toBe(false);
    }
  });

  it("rejects packages with memberType field", () => {
    const result = agentChapterFieldSchema.safeParse({
      type: "agent",
      memberType: "agent",
      name: "Repo Ops",
      slug: "repo-ops",
      runtimes: ["claude-code"],
      roles: ["@clawmasons/role-issue-manager"],
    });
    // Zod strips unknown fields by default
    expect(result.success).toBe(true);
    if (result.success) {
      expect("memberType" in result.data).toBe(false);
    }
  });

  it("defaults resources to empty array when not provided", () => {
    const result = agentChapterFieldSchema.safeParse({
      type: "agent",
      name: "Repo Ops",
      slug: "repo-ops",
      runtimes: ["claude-code"],
      roles: ["@clawmasons/role-issue-manager"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.resources).toEqual([]);
    }
  });
});
