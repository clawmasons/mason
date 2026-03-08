import { describe, it, expect } from "vitest";
import { parseChapterField } from "@clawmasons/shared";

describe("parseChapterField", () => {
  it("parses an app by type discrimination", () => {
    const result = parseChapterField({
      type: "app",
      transport: "stdio",
      command: "npx",
      args: [],
      tools: ["t"],
      capabilities: ["tools"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("app");
    }
  });

  it("parses a skill by type discrimination", () => {
    const result = parseChapterField({
      type: "skill",
      artifacts: ["./SKILL.md"],
      description: "A skill",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("skill");
    }
  });

  it("parses a task by type discrimination", () => {
    const result = parseChapterField({
      type: "task",
      taskType: "subagent",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("task");
    }
  });

  it("parses a role by type discrimination", () => {
    const result = parseChapterField({
      type: "role",
      permissions: {
        "@clawmasons/app-github": {
          allow: ["create_issue"],
          deny: [],
        },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("role");
    }
  });

  it("parses a member by type discrimination", () => {
    const result = parseChapterField({
      type: "agent",      name: "Note Taker",
      slug: "note-taker",      runtimes: ["claude-code"],
      roles: ["@clawmasons/role-issue-manager"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("agent");
    }
  });

  it("fails on unknown type", () => {
    const result = parseChapterField({ type: "unknown" });
    expect(result.success).toBe(false);
  });

  it("fails on missing type", () => {
    const result = parseChapterField({});
    expect(result.success).toBe(false);
  });

  it("fails on non-object input", () => {
    const result = parseChapterField("not an object");
    expect(result.success).toBe(false);
  });

  it("fails on null input", () => {
    const result = parseChapterField(null);
    expect(result.success).toBe(false);
  });
});
