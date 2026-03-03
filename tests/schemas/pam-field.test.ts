import { describe, it, expect } from "vitest";
import { parsePamField } from "../../src/schemas/pam-field.js";

describe("parsePamField", () => {
  it("parses an app by type discrimination", () => {
    const result = parsePamField({
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
    const result = parsePamField({
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
    const result = parsePamField({
      type: "task",
      taskType: "subagent",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("task");
    }
  });

  it("parses a role by type discrimination", () => {
    const result = parsePamField({
      type: "role",
      permissions: {
        "@clawforge/app-github": {
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

  it("parses an agent by type discrimination", () => {
    const result = parsePamField({
      type: "agent",
      runtimes: ["claude-code"],
      roles: ["@clawforge/role-issue-manager"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("agent");
    }
  });

  it("fails on unknown type", () => {
    const result = parsePamField({ type: "unknown" });
    expect(result.success).toBe(false);
  });

  it("fails on missing type", () => {
    const result = parsePamField({});
    expect(result.success).toBe(false);
  });

  it("fails on non-object input", () => {
    const result = parsePamField("not an object");
    expect(result.success).toBe(false);
  });

  it("fails on null input", () => {
    const result = parsePamField(null);
    expect(result.success).toBe(false);
  });
});
