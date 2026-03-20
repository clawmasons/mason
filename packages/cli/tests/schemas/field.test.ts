import { describe, it, expect } from "vitest";
import { parseField } from "@clawmasons/shared";

describe("parseField", () => {
  it("parses an app by type discrimination", () => {
    const result = parseField({
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
    const result = parseField({
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
    const result = parseField({
      type: "task",
      taskType: "subagent",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("task");
    }
  });

  it("parses a role by type discrimination", () => {
    const result = parseField({
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

  it("rejects deprecated agent type", () => {
    const result = parseField({
      type: "agent",
      name: "Note Taker",
      slug: "note-taker",
      runtimes: ["claude-code-agent"],
      roles: ["@clawmasons/role-issue-manager"],
    });
    expect(result.success).toBe(false);
  });

  it("fails on unknown type", () => {
    const result = parseField({ type: "unknown" });
    expect(result.success).toBe(false);
  });

  it("fails on missing type", () => {
    const result = parseField({});
    expect(result.success).toBe(false);
  });

  it("fails on non-object input", () => {
    const result = parseField("not an object");
    expect(result.success).toBe(false);
  });

  it("fails on null input", () => {
    const result = parseField(null);
    expect(result.success).toBe(false);
  });
});
