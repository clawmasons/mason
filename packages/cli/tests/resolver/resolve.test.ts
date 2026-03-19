import { describe, it, expect } from "vitest";
import { resolveRolePackage } from "../../src/resolver/resolve.js";
import {
  PackageNotFoundError,
  TypeMismatchError,
} from "../../src/resolver/errors.js";
import type { DiscoveredPackage, ChapterField } from "@clawmasons/shared";
import { parseChapterField } from "@clawmasons/shared";

/**
 * Helper to build a DiscoveredPackage from minimal inputs.
 */
function makePkg(name: string, version: string, chapterField: ChapterField): DiscoveredPackage {
  return { name, version, packagePath: `/fake/${name}`, chapterField };
}

/**
 * Build a fixture with roles, tasks, apps, and skills (no agent packages).
 */
function buildRoleFixture(): Map<string, DiscoveredPackage> {
  const packages = new Map<string, DiscoveredPackage>();

  // Apps
  packages.set("@clawmasons/app-github", makePkg("@clawmasons/app-github", "1.2.0", {
    type: "app",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_TOKEN}" },
    tools: ["create_issue", "list_repos", "create_pr"],
    capabilities: ["resources", "tools"],
    credentials: [],
  }));

  // Skills
  packages.set("@clawmasons/skill-labeling", makePkg("@clawmasons/skill-labeling", "1.0.0", {
    type: "skill",
    artifacts: ["./SKILL.md"],
    description: "Issue labeling taxonomy",
  }));

  // Tasks
  packages.set("@clawmasons/task-triage-issue", makePkg("@clawmasons/task-triage-issue", "0.3.1", {
    type: "task",
    taskType: "subagent",
    prompt: "./prompts/triage.md",
    requires: {
      apps: ["@clawmasons/app-github"],
      skills: ["@clawmasons/skill-labeling"],
    },
    timeout: "5m",
    approval: "auto",
  }));

  // Roles
  packages.set("@clawmasons/role-issue-manager", makePkg("@clawmasons/role-issue-manager", "2.0.0", {
    type: "role",
    risk: "LOW",
    description: "Manages GitHub issues.",
    tasks: ["@clawmasons/task-triage-issue"],
    skills: ["@clawmasons/skill-labeling"],
    permissions: {
      "@clawmasons/app-github": {
        allow: ["create_issue", "list_repos"],
        deny: ["delete_repo"],
      },
    },
  }));

  return packages;
}

describe("resolveRolePackage", () => {
  it("resolves a role with its tasks, apps, and skills", () => {
    const packages = buildRoleFixture();
    const resolved = resolveRolePackage("@clawmasons/role-issue-manager", packages);

    expect(resolved.name).toBe("@clawmasons/role-issue-manager");
    expect(resolved.version).toBe("2.0.0");
    expect(resolved.risk).toBe("LOW");
    expect(resolved.tasks).toHaveLength(1);
    expect(resolved.tasks[0]!.name).toBe("@clawmasons/task-triage-issue");
    expect(resolved.skills).toHaveLength(1);
    expect(resolved.skills[0]!.name).toBe("@clawmasons/skill-labeling");
    expect(resolved.apps).toHaveLength(1);
    expect(resolved.apps[0]!.name).toBe("@clawmasons/app-github");
  });

  it("throws PackageNotFoundError for missing role", () => {
    const packages = buildRoleFixture();
    expect(() => resolveRolePackage("@clawmasons/nonexistent", packages))
      .toThrow(PackageNotFoundError);
  });

  it("throws TypeMismatchError when package is not a role", () => {
    const packages = buildRoleFixture();
    expect(() => resolveRolePackage("@clawmasons/app-github", packages))
      .toThrow(TypeMismatchError);
  });

  it("resolves permissions from role permissions keys", () => {
    const packages = buildRoleFixture();
    const resolved = resolveRolePackage("@clawmasons/role-issue-manager", packages);
    expect(resolved.permissions).toHaveProperty("@clawmasons/app-github");
  });
});

describe("agent type rejection", () => {
  it("rejects chapter.type = 'agent' in schema validation", () => {
    const result = parseChapterField({
      type: "agent",
      name: "Test Agent",
      slug: "test-agent",
      runtimes: ["claude-code-agent"],
      roles: ["@test/role"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts chapter.type = 'role' in schema validation", () => {
    const result = parseChapterField({
      type: "role",
      risk: "LOW",
      permissions: {
        "@test/app": { allow: ["tool1"], deny: [] },
      },
    });
    expect(result.success).toBe(true);
  });
});
