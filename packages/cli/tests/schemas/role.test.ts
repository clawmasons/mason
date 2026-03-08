import { describe, it, expect } from "vitest";
import { roleChapterFieldSchema } from "@clawmasons/shared";

describe("roleChapterFieldSchema", () => {
  it("validates a valid role with permissions", () => {
    const result = roleChapterFieldSchema.safeParse({
      type: "role",
      permissions: {
        "@clawmasons/app-github": {
          allow: ["create_issue", "list_repos"],
          deny: ["delete_repo"],
        },
      },
      tasks: ["@clawmasons/task-triage-issue"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(
        result.data.permissions["@clawmasons/app-github"].allow,
      ).toContain("create_issue");
    }
  });

  it("validates role with deny wildcard", () => {
    const result = roleChapterFieldSchema.safeParse({
      type: "role",
      permissions: {
        "@clawmasons/app-slack": {
          allow: ["send_message"],
          deny: ["*"],
        },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.permissions["@clawmasons/app-slack"].deny).toEqual([
        "*",
      ]);
    }
  });

  it("validates role with constraints", () => {
    const result = roleChapterFieldSchema.safeParse({
      type: "role",
      permissions: {
        "@clawmasons/app-github": {
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
    const result = roleChapterFieldSchema.safeParse({
      type: "role",
    });
    expect(result.success).toBe(false);
  });

  it("validates PRD example: @clawmasons/role-issue-manager", () => {
    const result = roleChapterFieldSchema.safeParse({
      type: "role",
      description: "Manages GitHub issues: triage, label, assign.",
      tasks: [
        "@clawmasons/task-triage-issue",
        "@clawmasons/task-assign-issue",
      ],
      skills: ["@clawmasons/skill-labeling"],
      permissions: {
        "@clawmasons/app-github": {
          allow: ["create_issue", "list_repos", "add_label"],
          deny: ["delete_repo", "transfer_repo"],
        },
        "@clawmasons/app-slack": {
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
