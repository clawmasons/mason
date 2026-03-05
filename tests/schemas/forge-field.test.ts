import { describe, it, expect } from "vitest";
import { parseForgeField } from "../../src/schemas/forge-field.js";

describe("parseForgeField", () => {
  it("parses an app by type discrimination", () => {
    const result = parseForgeField({
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
    const result = parseForgeField({
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
    const result = parseForgeField({
      type: "task",
      taskType: "subagent",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("task");
    }
  });

  it("parses a role by type discrimination", () => {
    const result = parseForgeField({
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
    const result = parseForgeField({
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
    const result = parseForgeField({ type: "unknown" });
    expect(result.success).toBe(false);
  });

  it("fails on missing type", () => {
    const result = parseForgeField({});
    expect(result.success).toBe(false);
  });

  it("fails on non-object input", () => {
    const result = parseForgeField("not an object");
    expect(result.success).toBe(false);
  });

  it("fails on null input", () => {
    const result = parseForgeField(null);
    expect(result.success).toBe(false);
  });
});
