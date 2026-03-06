import { describe, it, expect } from "vitest";
import { resolveAgent } from "../../src/resolver/resolve.js";
import {
  PackageNotFoundError,
  CircularDependencyError,
  TypeMismatchError,
} from "../../src/resolver/errors.js";
import type { DiscoveredPackage } from "../../src/resolver/types.js";
import type { ForgeField } from "../../src/schemas/index.js";

/**
 * Helper to build a DiscoveredPackage from minimal inputs.
 */
function makePkg(name: string, version: string, forgeField: ForgeField): DiscoveredPackage {
  return { name, version, packagePath: `/fake/${name}`, forgeField };
}

/**
 * Build the full PRD repo-ops example discovery map.
 */
function buildRepoOpsFixture(): Map<string, DiscoveredPackage> {
  const packages = new Map<string, DiscoveredPackage>();

  // Apps
  packages.set("@clawmasons/app-github", makePkg("@clawmasons/app-github", "1.2.0", {
    type: "app",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_TOKEN}" },
    tools: ["create_issue", "list_repos", "create_pr", "get_pr", "create_review", "add_label", "delete_repo", "transfer_repo"],
    capabilities: ["resources", "tools"],
  }));

  packages.set("@clawmasons/app-slack", makePkg("@clawmasons/app-slack", "1.0.0", {
    type: "app",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-slack"],
    env: { SLACK_BOT_TOKEN: "${SLACK_BOT_TOKEN}" },
    tools: ["send_message"],
    capabilities: ["tools"],
  }));

  // Skills
  packages.set("@clawmasons/skill-labeling", makePkg("@clawmasons/skill-labeling", "1.0.0", {
    type: "skill",
    artifacts: ["./SKILL.md", "./examples/", "./schemas/"],
    description: "Issue labeling taxonomy and heuristics",
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

  packages.set("@clawmasons/task-assign-issue", makePkg("@clawmasons/task-assign-issue", "1.0.0", {
    type: "task",
    taskType: "subagent",
    prompt: "./prompts/assign.md",
    requires: {
      apps: ["@clawmasons/app-github"],
    },
  }));

  packages.set("@clawmasons/task-review-pr", makePkg("@clawmasons/task-review-pr", "1.0.0", {
    type: "task",
    taskType: "subagent",
    prompt: "./prompts/review.md",
    requires: {
      apps: ["@clawmasons/app-github"],
    },
  }));

  // Roles
  packages.set("@clawmasons/role-issue-manager", makePkg("@clawmasons/role-issue-manager", "2.0.0", {
    type: "role",
    description: "Manages GitHub issues: triage, label, assign.",
    tasks: ["@clawmasons/task-triage-issue", "@clawmasons/task-assign-issue"],
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
  }));

  packages.set("@clawmasons/role-pr-reviewer", makePkg("@clawmasons/role-pr-reviewer", "1.0.0", {
    type: "role",
    description: "Reviews pull requests and provides feedback.",
    tasks: ["@clawmasons/task-review-pr"],
    permissions: {
      "@clawmasons/app-github": {
        allow: ["list_repos", "get_pr", "create_review"],
        deny: ["delete_repo", "transfer_repo"],
      },
    },
  }));

  // Agent
  packages.set("@clawmasons/agent-repo-ops", makePkg("@clawmasons/agent-repo-ops", "1.0.0", {
    type: "agent",
    description: "Repository operations agent for GitHub.",
    runtimes: ["claude-code", "codex"],
    roles: ["@clawmasons/role-issue-manager", "@clawmasons/role-pr-reviewer"],
    resources: [{ type: "github-repo", ref: "clawmasons/openclaw", access: "read-write" }],
    proxy: { port: 9090, type: "sse" },
  }));

  return packages;
}

describe("resolveAgent", () => {
  describe("PRD repo-ops agent example", () => {
    it("resolves the full agent with 2 roles", () => {
      const packages = buildRepoOpsFixture();
      const resolved = resolveAgent("@clawmasons/agent-repo-ops", packages);

      expect(resolved.name).toBe("@clawmasons/agent-repo-ops");
      expect(resolved.version).toBe("1.0.0");
      expect(resolved.description).toBe("Repository operations agent for GitHub.");
      expect(resolved.runtimes).toEqual(["claude-code", "codex"]);
      expect(resolved.roles).toHaveLength(2);
    });

    it("resolves issue-manager role with tasks, apps, skills", () => {
      const packages = buildRepoOpsFixture();
      const resolved = resolveAgent("@clawmasons/agent-repo-ops", packages);

      const issueManager = resolved.roles.find(r => r.name === "@clawmasons/role-issue-manager");
      expect(issueManager).toBeDefined();
      expect(issueManager?.description).toBe("Manages GitHub issues: triage, label, assign.");
      expect(issueManager?.tasks).toHaveLength(2);
      expect(issueManager?.skills).toHaveLength(1);
      expect(issueManager?.apps).toHaveLength(2); // github + slack from permissions
      expect(issueManager?.permissions).toHaveProperty("@clawmasons/app-github");
      expect(issueManager?.constraints?.maxConcurrentTasks).toBe(3);
    });

    it("resolves pr-reviewer role", () => {
      const packages = buildRepoOpsFixture();
      const resolved = resolveAgent("@clawmasons/agent-repo-ops", packages);

      const prReviewer = resolved.roles.find(r => r.name === "@clawmasons/role-pr-reviewer");
      expect(prReviewer).toBeDefined();
      expect(prReviewer?.tasks).toHaveLength(1);
      expect(prReviewer?.apps).toHaveLength(1); // github from permissions
      expect(prReviewer?.skills).toHaveLength(0);
    });

    it("resolves task with required apps and skills", () => {
      const packages = buildRepoOpsFixture();
      const resolved = resolveAgent("@clawmasons/agent-repo-ops", packages);

      const issueManager = resolved.roles.find(r => r.name === "@clawmasons/role-issue-manager");
      expect(issueManager).toBeDefined();
      const triageTask = issueManager?.tasks.find(t => t.name === "@clawmasons/task-triage-issue");
      expect(triageTask).toBeDefined();

      expect(triageTask?.taskType).toBe("subagent");
      expect(triageTask?.prompt).toBe("./prompts/triage.md");
      expect(triageTask?.timeout).toBe("5m");
      expect(triageTask?.approval).toBe("auto");
      expect(triageTask?.apps).toHaveLength(1);
      expect(triageTask?.apps[0].name).toBe("@clawmasons/app-github");
      expect(triageTask?.skills).toHaveLength(1);
      expect(triageTask?.skills[0].name).toBe("@clawmasons/skill-labeling");
    });

    it("resolves app with full details", () => {
      const packages = buildRepoOpsFixture();
      const resolved = resolveAgent("@clawmasons/agent-repo-ops", packages);

      const issueManager = resolved.roles.find(r => r.name === "@clawmasons/role-issue-manager");
      expect(issueManager).toBeDefined();
      const github = issueManager?.apps.find(a => a.name === "@clawmasons/app-github");
      expect(github).toBeDefined();

      expect(github?.transport).toBe("stdio");
      expect(github?.command).toBe("npx");
      expect(github?.args).toEqual(["-y", "@modelcontextprotocol/server-github"]);
      expect(github?.tools).toContain("create_issue");
      expect(github?.env?.GITHUB_PERSONAL_ACCESS_TOKEN).toBe("${GITHUB_TOKEN}");
    });

    it("resolves skill with full details", () => {
      const packages = buildRepoOpsFixture();
      const resolved = resolveAgent("@clawmasons/agent-repo-ops", packages);

      const issueManager = resolved.roles.find(r => r.name === "@clawmasons/role-issue-manager");
      expect(issueManager).toBeDefined();
      const skill = issueManager?.skills[0];
      expect(skill).toBeDefined();

      expect(skill?.name).toBe("@clawmasons/skill-labeling");
      expect(skill?.artifacts).toEqual(["./SKILL.md", "./examples/", "./schemas/"]);
      expect(skill?.description).toBe("Issue labeling taxonomy and heuristics");
    });

    it("includes resources and proxy config", () => {
      const packages = buildRepoOpsFixture();
      const resolved = resolveAgent("@clawmasons/agent-repo-ops", packages);

      expect(resolved.resources).toHaveLength(1);
      expect(resolved.resources?.[0]).toEqual({
        type: "github-repo",
        ref: "clawmasons/openclaw",
        access: "read-write",
      });
      expect(resolved.proxy).toEqual({
        port: 9090,
        type: "sse",
      });
    });

    it("produces serializable output", () => {
      const packages = buildRepoOpsFixture();
      const resolved = resolveAgent("@clawmasons/agent-repo-ops", packages);

      const json = JSON.stringify(resolved);
      const parsed = JSON.parse(json);
      expect(parsed.name).toBe("@clawmasons/agent-repo-ops");
      expect(parsed.roles).toHaveLength(2);
    });
  });

  describe("diamond dependencies", () => {
    it("same app referenced by multiple roles resolves correctly", () => {
      const packages = buildRepoOpsFixture();
      const resolved = resolveAgent("@clawmasons/agent-repo-ops", packages);

      // Both roles reference @clawmasons/app-github
      const issueManager = resolved.roles.find(r => r.name === "@clawmasons/role-issue-manager");
      const prReviewer = resolved.roles.find(r => r.name === "@clawmasons/role-pr-reviewer");

      const imGithub = issueManager?.apps.find(a => a.name === "@clawmasons/app-github");
      const prGithub = prReviewer?.apps.find(a => a.name === "@clawmasons/app-github");

      expect(imGithub).toBeDefined();
      expect(prGithub).toBeDefined();
      expect(imGithub?.name).toBe(prGithub?.name);
    });
  });

  describe("error cases", () => {
    it("throws PackageNotFoundError when agent is not found", () => {
      const packages = new Map<string, DiscoveredPackage>();

      expect(() => resolveAgent("@clawmasons/nonexistent", packages))
        .toThrow(PackageNotFoundError);
      expect(() => resolveAgent("@clawmasons/nonexistent", packages))
        .toThrow('Package "@clawmasons/nonexistent" not found');
    });

    it("throws TypeMismatchError when agent references non-role package", () => {
      const packages = new Map<string, DiscoveredPackage>();
      packages.set("@clawmasons/agent-bad", makePkg("@clawmasons/agent-bad", "1.0.0", {
        type: "agent",
        runtimes: ["claude-code"],
        roles: ["@clawmasons/app-github"],
      }));
      packages.set("@clawmasons/app-github", makePkg("@clawmasons/app-github", "1.0.0", {
        type: "app",
        transport: "stdio",
        command: "npx",
        args: [],
        tools: ["t"],
        capabilities: ["tools"],
      }));

      expect(() => resolveAgent("@clawmasons/agent-bad", packages))
        .toThrow(TypeMismatchError);
      expect(() => resolveAgent("@clawmasons/agent-bad", packages))
        .toThrow('type "app" but expected "role"');
    });

    it("throws TypeMismatchError when role references non-task package", () => {
      const packages = new Map<string, DiscoveredPackage>();
      packages.set("@test/agent", makePkg("@test/agent", "1.0.0", {
        type: "agent",
        runtimes: ["claude-code"],
        roles: ["@test/role"],
      }));
      packages.set("@test/role", makePkg("@test/role", "1.0.0", {
        type: "role",
        tasks: ["@test/skill-not-task"],
        permissions: {},
      }));
      packages.set("@test/skill-not-task", makePkg("@test/skill-not-task", "1.0.0", {
        type: "skill",
        artifacts: ["./SKILL.md"],
        description: "Not a task",
      }));

      expect(() => resolveAgent("@test/agent", packages))
        .toThrow(TypeMismatchError);
      expect(() => resolveAgent("@test/agent", packages))
        .toThrow('type "skill" but expected "task"');
    });

    it("throws PackageNotFoundError with context when task requires missing app", () => {
      const packages = new Map<string, DiscoveredPackage>();
      packages.set("@test/agent", makePkg("@test/agent", "1.0.0", {
        type: "agent",
        runtimes: ["claude-code"],
        roles: ["@test/role"],
      }));
      packages.set("@test/role", makePkg("@test/role", "1.0.0", {
        type: "role",
        tasks: ["@test/task"],
        permissions: {},
      }));
      packages.set("@test/task", makePkg("@test/task", "1.0.0", {
        type: "task",
        taskType: "subagent",
        requires: { apps: ["@test/missing-app"] },
      }));

      expect(() => resolveAgent("@test/agent", packages))
        .toThrow(PackageNotFoundError);
      expect(() => resolveAgent("@test/agent", packages))
        .toThrow("@test/missing-app");
    });

    it("throws PackageNotFoundError when role references missing task", () => {
      const packages = new Map<string, DiscoveredPackage>();
      packages.set("@test/agent", makePkg("@test/agent", "1.0.0", {
        type: "agent",
        runtimes: ["claude-code"],
        roles: ["@test/role"],
      }));
      packages.set("@test/role", makePkg("@test/role", "1.0.0", {
        type: "role",
        tasks: ["@test/missing-task"],
        permissions: {},
      }));

      expect(() => resolveAgent("@test/agent", packages))
        .toThrow(PackageNotFoundError);
      expect(() => resolveAgent("@test/agent", packages))
        .toThrow("@test/missing-task");
    });

    it("throws PackageNotFoundError when role permissions reference missing app", () => {
      const packages = new Map<string, DiscoveredPackage>();
      packages.set("@test/agent", makePkg("@test/agent", "1.0.0", {
        type: "agent",
        runtimes: ["claude-code"],
        roles: ["@test/role"],
      }));
      packages.set("@test/role", makePkg("@test/role", "1.0.0", {
        type: "role",
        permissions: {
          "@test/missing-app": { allow: ["foo"], deny: [] },
        },
      }));

      expect(() => resolveAgent("@test/agent", packages))
        .toThrow(PackageNotFoundError);
      expect(() => resolveAgent("@test/agent", packages))
        .toThrow("@test/missing-app");
    });

    it("throws TypeMismatchError when resolving non-agent as agent", () => {
      const packages = new Map<string, DiscoveredPackage>();
      packages.set("@test/role", makePkg("@test/role", "1.0.0", {
        type: "role",
        permissions: {},
      }));

      expect(() => resolveAgent("@test/role", packages))
        .toThrow(TypeMismatchError);
      expect(() => resolveAgent("@test/role", packages))
        .toThrow('type "role" but expected "agent"');
    });
  });

  describe("composite tasks", () => {
    it("resolves composite task with sub-tasks", () => {
      const packages = new Map<string, DiscoveredPackage>();
      packages.set("@test/agent", makePkg("@test/agent", "1.0.0", {
        type: "agent",
        runtimes: ["claude-code"],
        roles: ["@test/role"],
      }));
      packages.set("@test/role", makePkg("@test/role", "1.0.0", {
        type: "role",
        tasks: ["@test/composite-task"],
        permissions: {},
      }));
      packages.set("@test/composite-task", makePkg("@test/composite-task", "1.0.0", {
        type: "task",
        taskType: "composite",
        tasks: ["@test/task-a", "@test/task-b"],
      }));
      packages.set("@test/task-a", makePkg("@test/task-a", "1.0.0", {
        type: "task",
        taskType: "subagent",
      }));
      packages.set("@test/task-b", makePkg("@test/task-b", "1.0.0", {
        type: "task",
        taskType: "script",
      }));

      const resolved = resolveAgent("@test/agent", packages);
      const composite = resolved.roles[0].tasks[0];
      expect(composite.taskType).toBe("composite");
      expect(composite.subTasks).toHaveLength(2);
      expect(composite.subTasks[0].name).toBe("@test/task-a");
      expect(composite.subTasks[1].name).toBe("@test/task-b");
    });
  });

  describe("circular dependencies", () => {
    it("detects direct circular dependency between tasks", () => {
      const packages = new Map<string, DiscoveredPackage>();
      packages.set("@test/agent", makePkg("@test/agent", "1.0.0", {
        type: "agent",
        runtimes: ["claude-code"],
        roles: ["@test/role"],
      }));
      packages.set("@test/role", makePkg("@test/role", "1.0.0", {
        type: "role",
        tasks: ["@test/task-a"],
        permissions: {},
      }));
      packages.set("@test/task-a", makePkg("@test/task-a", "1.0.0", {
        type: "task",
        taskType: "composite",
        tasks: ["@test/task-b"],
      }));
      packages.set("@test/task-b", makePkg("@test/task-b", "1.0.0", {
        type: "task",
        taskType: "composite",
        tasks: ["@test/task-a"],
      }));

      expect(() => resolveAgent("@test/agent", packages))
        .toThrow(CircularDependencyError);
      expect(() => resolveAgent("@test/agent", packages))
        .toThrow("@test/task-a");
    });

    it("detects transitive circular dependency", () => {
      const packages = new Map<string, DiscoveredPackage>();
      packages.set("@test/agent", makePkg("@test/agent", "1.0.0", {
        type: "agent",
        runtimes: ["claude-code"],
        roles: ["@test/role"],
      }));
      packages.set("@test/role", makePkg("@test/role", "1.0.0", {
        type: "role",
        tasks: ["@test/task-a"],
        permissions: {},
      }));
      packages.set("@test/task-a", makePkg("@test/task-a", "1.0.0", {
        type: "task",
        taskType: "composite",
        tasks: ["@test/task-b"],
      }));
      packages.set("@test/task-b", makePkg("@test/task-b", "1.0.0", {
        type: "task",
        taskType: "composite",
        tasks: ["@test/task-c"],
      }));
      packages.set("@test/task-c", makePkg("@test/task-c", "1.0.0", {
        type: "task",
        taskType: "composite",
        tasks: ["@test/task-a"],
      }));

      expect(() => resolveAgent("@test/agent", packages))
        .toThrow(CircularDependencyError);
    });
  });

  describe("minimal agents", () => {
    it("resolves agent with role that has no tasks or skills", () => {
      const packages = new Map<string, DiscoveredPackage>();
      packages.set("@test/agent", makePkg("@test/agent", "1.0.0", {
        type: "agent",
        runtimes: ["claude-code"],
        roles: ["@test/role"],
      }));
      packages.set("@test/role", makePkg("@test/role", "1.0.0", {
        type: "role",
        permissions: {},
      }));

      const resolved = resolveAgent("@test/agent", packages);
      expect(resolved.roles).toHaveLength(1);
      expect(resolved.roles[0].tasks).toHaveLength(0);
      expect(resolved.roles[0].skills).toHaveLength(0);
      expect(resolved.roles[0].apps).toHaveLength(0);
    });

    it("resolves agent without optional fields", () => {
      const packages = new Map<string, DiscoveredPackage>();
      packages.set("@test/agent", makePkg("@test/agent", "1.0.0", {
        type: "agent",
        runtimes: ["claude-code"],
        roles: ["@test/role"],
      }));
      packages.set("@test/role", makePkg("@test/role", "1.0.0", {
        type: "role",
        permissions: {},
      }));

      const resolved = resolveAgent("@test/agent", packages);
      expect(resolved.description).toBeUndefined();
      expect(resolved.resources).toBeUndefined();
      expect(resolved.proxy).toBeUndefined();
    });
  });
});
