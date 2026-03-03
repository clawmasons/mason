import { describe, it, expect } from "vitest";
import { rolePamFieldSchema } from "../../src/schemas/role.js";

describe("rolePamFieldSchema", () => {
  it("validates a valid role with permissions", () => {
    const result = rolePamFieldSchema.safeParse({
      type: "role",
      permissions: {
        "@clawforge/app-github": {
          allow: ["create_issue", "list_repos"],
          deny: ["delete_repo"],
        },
      },
      tasks: ["@clawforge/task-triage-issue"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(
        result.data.permissions["@clawforge/app-github"].allow,
      ).toContain("create_issue");
    }
  });

  it("validates role with deny wildcard", () => {
    const result = rolePamFieldSchema.safeParse({
      type: "role",
      permissions: {
        "@clawforge/app-slack": {
          allow: ["send_message"],
          deny: ["*"],
        },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.permissions["@clawforge/app-slack"].deny).toEqual([
        "*",
      ]);
    }
  });

  it("validates role with constraints", () => {
    const result = rolePamFieldSchema.safeParse({
      type: "role",
      permissions: {
        "@clawforge/app-github": {
          allow: ["create_issue"],
          deny: [],
        },
      },
      constraints: {
        maxConcurrentTasks: 3,
        requireApprovalFor: ["assign_issue"],
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.constraints?.maxConcurrentTasks).toBe(3);
      expect(result.data.constraints?.requireApprovalFor).toEqual([
        "assign_issue",
      ]);
    }
  });

  it("rejects role without permissions", () => {
    const result = rolePamFieldSchema.safeParse({
      type: "role",
    });
    expect(result.success).toBe(false);
  });

  it("validates PRD example: @clawforge/role-issue-manager", () => {
    const result = rolePamFieldSchema.safeParse({
      type: "role",
      description: "Manages GitHub issues: triage, label, assign.",
      tasks: [
        "@clawforge/task-triage-issue",
        "@clawforge/task-assign-issue",
      ],
      skills: ["@clawforge/skill-labeling"],
      permissions: {
        "@clawforge/app-github": {
          allow: ["create_issue", "list_repos", "add_label"],
          deny: ["delete_repo", "transfer_repo"],
        },
        "@clawforge/app-slack": {
          allow: ["send_message"],
          deny: ["*"],
        },
      },
      constraints: {
        maxConcurrentTasks: 3,
        requireApprovalFor: ["assign_issue"],
      },
    });
    expect(result.success).toBe(true);
  });
});
