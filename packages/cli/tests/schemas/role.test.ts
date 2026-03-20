import { describe, it, expect } from "vitest";
import { roleFieldSchema } from "@clawmasons/shared";

describe("roleFieldSchema", () => {
  it("validates a valid role with permissions", () => {
    const result = roleFieldSchema.safeParse({
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
    const result = roleFieldSchema.safeParse({
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
    const result = roleFieldSchema.safeParse({
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
    const result = roleFieldSchema.safeParse({
      type: "role",
    });
    expect(result.success).toBe(false);
  });

  it("validates risk enum values", () => {
    for (const risk of ["HIGH", "MEDIUM", "LOW"]) {
      const result = roleFieldSchema.safeParse({
        type: "role",
        risk,
        permissions: {},
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.risk).toBe(risk);
      }
    }
  });

  it("rejects invalid risk value", () => {
    const result = roleFieldSchema.safeParse({
      type: "role",
      risk: "INVALID",
      permissions: {},
    });
    expect(result.success).toBe(false);
  });

  it("defaults risk to LOW when omitted", () => {
    const result = roleFieldSchema.safeParse({
      type: "role",
      permissions: {},
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.risk).toBe("LOW");
    }
  });

  describe("mounts field", () => {
    it("validates role with valid mounts", () => {
      const result = roleFieldSchema.safeParse({
        type: "role",
        permissions: {},
        mounts: [
          { source: "${LODGE_HOME}", target: "/home/mason/${LODGE}" },
        ],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mounts).toHaveLength(1);
        expect(result.data.mounts![0].source).toBe("${LODGE_HOME}");
        expect(result.data.mounts![0].target).toBe("/home/mason/${LODGE}");
        expect(result.data.mounts![0].readonly).toBe(false);
      }
    });

    it("validates mount with explicit readonly flag", () => {
      const result = roleFieldSchema.safeParse({
        type: "role",
        permissions: {},
        mounts: [
          { source: "/data", target: "/mnt/data", readonly: true },
        ],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mounts![0].readonly).toBe(true);
      }
    });

    it("rejects mount missing target", () => {
      const result = roleFieldSchema.safeParse({
        type: "role",
        permissions: {},
        mounts: [{ source: "/data" }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects mount missing source", () => {
      const result = roleFieldSchema.safeParse({
        type: "role",
        permissions: {},
        mounts: [{ target: "/mnt/data" }],
      });
      expect(result.success).toBe(false);
    });

    it("validates empty mounts array", () => {
      const result = roleFieldSchema.safeParse({
        type: "role",
        permissions: {},
        mounts: [],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mounts).toEqual([]);
      }
    });

    it("validates multiple mounts", () => {
      const result = roleFieldSchema.safeParse({
        type: "role",
        permissions: {},
        mounts: [
          { source: "${LODGE_HOME}", target: "/home/mason/${LODGE}" },
          { source: "/tmp/cache", target: "/cache", readonly: true },
        ],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mounts).toHaveLength(2);
      }
    });
  });

  describe("baseImage field", () => {
    it("validates role with baseImage", () => {
      const result = roleFieldSchema.safeParse({
        type: "role",
        permissions: {},
        baseImage: "node:22-bookworm",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.baseImage).toBe("node:22-bookworm");
      }
    });

    it("rejects non-string baseImage", () => {
      const result = roleFieldSchema.safeParse({
        type: "role",
        permissions: {},
        baseImage: 123,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("aptPackages field", () => {
    it("validates role with aptPackages", () => {
      const result = roleFieldSchema.safeParse({
        type: "role",
        permissions: {},
        aptPackages: ["git", "curl", "jq"],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.aptPackages).toEqual(["git", "curl", "jq"]);
      }
    });

    it("validates empty aptPackages array", () => {
      const result = roleFieldSchema.safeParse({
        type: "role",
        permissions: {},
        aptPackages: [],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.aptPackages).toEqual([]);
      }
    });
  });

  describe("backwards compatibility", () => {
    it("validates role without new fields", () => {
      const result = roleFieldSchema.safeParse({
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
        expect(result.data.mounts).toBeUndefined();
        expect(result.data.baseImage).toBeUndefined();
        expect(result.data.aptPackages).toBeUndefined();
      }
    });
  });

  it("validates PRD example: @clawmasons/role-issue-manager", () => {
    const result = roleFieldSchema.safeParse({
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
