import { describe, it, expect } from "vitest";
import { validateAgent } from "../../src/validator/validate.js";
import type { ResolvedAgent, ResolvedApp, ResolvedRole, ResolvedSkill, ResolvedTask } from "../../src/resolver/types.js";

// --- Test helpers ---

function makeApp(overrides: Partial<ResolvedApp> = {}): ResolvedApp {
  return {
    name: "@clawforge/app-github",
    version: "1.0.0",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    tools: ["create_issue", "list_repos", "add_label", "get_pr", "create_review", "delete_repo", "transfer_repo"],
    capabilities: ["tools"],
    ...overrides,
  };
}

function makeSkill(overrides: Partial<ResolvedSkill> = {}): ResolvedSkill {
  return {
    name: "@clawforge/skill-labeling",
    version: "1.0.0",
    artifacts: ["./SKILL.md"],
    description: "Issue labeling taxonomy",
    ...overrides,
  };
}

function makeTask(overrides: Partial<ResolvedTask> = {}): ResolvedTask {
  return {
    name: "@clawforge/task-triage-issue",
    version: "1.0.0",
    taskType: "subagent",
    prompt: "./prompts/triage.md",
    requiredApps: ["@clawforge/app-github"],
    requiredSkills: ["@clawforge/skill-labeling"],
    apps: [makeApp()],
    skills: [makeSkill()],
    subTasks: [],
    ...overrides,
  };
}

function makeRole(overrides: Partial<ResolvedRole> = {}): ResolvedRole {
  return {
    name: "@clawforge/role-issue-manager",
    version: "1.0.0",
    description: "Manages GitHub issues",
    permissions: {
      "@clawforge/app-github": {
        allow: ["create_issue", "list_repos", "add_label"],
        deny: ["delete_repo", "transfer_repo"],
      },
    },
    tasks: [makeTask()],
    apps: [makeApp()],
    skills: [makeSkill()],
    ...overrides,
  };
}

function makeAgent(overrides: Partial<ResolvedAgent> = {}): ResolvedAgent {
  return {
    name: "@clawforge/agent-repo-ops",
    version: "1.0.0",
    description: "Repository operations agent",
    runtimes: ["claude-code"],
    roles: [makeRole()],
    ...overrides,
  };
}

// --- Tests ---

describe("validateAgent", () => {
  describe("valid agents", () => {
    it("returns valid for a well-formed agent", () => {
      const result = validateAgent(makeAgent());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("validates PRD repo-ops agent example", () => {
      const githubApp = makeApp({
        name: "@clawforge/app-github",
        tools: ["create_issue", "list_repos", "create_pr", "get_pr", "create_review", "add_label", "delete_repo", "transfer_repo"],
      });

      const slackApp = makeApp({
        name: "@clawforge/app-slack",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-slack"],
        tools: ["send_message"],
        capabilities: ["tools"],
      });

      const skill = makeSkill();

      const issueManagerRole = makeRole({
        name: "@clawforge/role-issue-manager",
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
        tasks: [
          makeTask({
            name: "@clawforge/task-triage-issue",
            requiredApps: ["@clawforge/app-github"],
            requiredSkills: ["@clawforge/skill-labeling"],
            apps: [githubApp],
            skills: [skill],
          }),
        ],
        apps: [githubApp, slackApp],
        skills: [skill],
      });

      const prReviewerRole = makeRole({
        name: "@clawforge/role-pr-reviewer",
        permissions: {
          "@clawforge/app-github": {
            allow: ["list_repos", "get_pr", "create_review"],
            deny: [],
          },
        },
        tasks: [],
        apps: [githubApp],
        skills: [],
      });

      const agent = makeAgent({
        roles: [issueManagerRole, prReviewerRole],
        runtimes: ["claude-code", "codex"],
      });

      const result = validateAgent(agent);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("returns valid for agent with no tasks in roles", () => {
      const result = validateAgent(makeAgent({
        roles: [makeRole({ tasks: [], skills: [] })],
      }));
      expect(result.valid).toBe(true);
    });
  });

  describe("requirement coverage", () => {
    it("fails when task requires app not in role permissions", () => {
      const slackApp = makeApp({
        name: "@clawforge/app-slack",
        tools: ["send_message"],
      });

      const task = makeTask({
        apps: [makeApp(), slackApp], // task requires both github and slack
      });

      // Role only has permissions for github, not slack
      const role = makeRole({
        tasks: [task],
      });

      const result = validateAgent(makeAgent({ roles: [role] }));
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].category).toBe("requirement-coverage");
      expect(result.errors[0].context.app).toBe("@clawforge/app-slack");
      expect(result.errors[0].context.task).toBe("@clawforge/task-triage-issue");
      expect(result.errors[0].context.role).toBe("@clawforge/role-issue-manager");
    });

    it("checks sub-task requirement coverage recursively", () => {
      const slackApp = makeApp({
        name: "@clawforge/app-slack",
        tools: ["send_message"],
      });

      const subTask = makeTask({
        name: "@clawforge/task-notify",
        apps: [slackApp],
        skills: [],
        requiredSkills: [],
        subTasks: [],
      });

      const compositeTask = makeTask({
        name: "@clawforge/task-triage-and-notify",
        taskType: "composite",
        apps: [],
        skills: [],
        requiredApps: [],
        requiredSkills: [],
        subTasks: [subTask],
      });

      const role = makeRole({
        tasks: [compositeTask],
        // No slack permissions
      });

      const result = validateAgent(makeAgent({ roles: [role] }));
      expect(result.valid).toBe(false);
      const coverageErrors = result.errors.filter((e) => e.category === "requirement-coverage");
      expect(coverageErrors).toHaveLength(1);
      expect(coverageErrors[0].context.app).toBe("@clawforge/app-slack");
      expect(coverageErrors[0].context.task).toBe("@clawforge/task-notify");
    });

    it("passes when task requires app covered by role permissions", () => {
      const result = validateAgent(makeAgent());
      const coverageErrors = result.errors.filter((e) => e.category === "requirement-coverage");
      expect(coverageErrors).toHaveLength(0);
    });
  });

  describe("tool existence", () => {
    it("fails when role allows a tool not exposed by app", () => {
      const role = makeRole({
        permissions: {
          "@clawforge/app-github": {
            allow: ["create_issue", "nonexistent_tool"],
            deny: [],
          },
        },
      });

      const result = validateAgent(makeAgent({ roles: [role] }));
      expect(result.valid).toBe(false);
      const toolErrors = result.errors.filter((e) => e.category === "tool-existence");
      expect(toolErrors).toHaveLength(1);
      expect(toolErrors[0].context.tool).toBe("nonexistent_tool");
      expect(toolErrors[0].context.app).toBe("@clawforge/app-github");
      expect(toolErrors[0].context.role).toBe("@clawforge/role-issue-manager");
    });

    it("reports multiple missing tools", () => {
      const role = makeRole({
        permissions: {
          "@clawforge/app-github": {
            allow: ["fake_tool_1", "fake_tool_2", "create_issue"],
            deny: [],
          },
        },
      });

      const result = validateAgent(makeAgent({ roles: [role] }));
      const toolErrors = result.errors.filter((e) => e.category === "tool-existence");
      expect(toolErrors).toHaveLength(2);
      expect(toolErrors.map((e) => e.context.tool).sort()).toEqual(["fake_tool_1", "fake_tool_2"]);
    });

    it("passes when all allowed tools exist in app", () => {
      const result = validateAgent(makeAgent());
      const toolErrors = result.errors.filter((e) => e.category === "tool-existence");
      expect(toolErrors).toHaveLength(0);
    });
  });

  describe("skill availability", () => {
    it("passes when task skill is available in task resolution", () => {
      const result = validateAgent(makeAgent());
      const skillErrors = result.errors.filter((e) => e.category === "skill-availability");
      expect(skillErrors).toHaveLength(0);
    });

    it("passes when task skill is available via parent role", () => {
      const skill = makeSkill();
      const task = makeTask({
        requiredSkills: ["@clawforge/skill-labeling"],
        skills: [], // NOT in task's resolved skills
      });
      const role = makeRole({
        tasks: [task],
        skills: [skill], // but IS in the role's skills
      });

      const result = validateAgent(makeAgent({ roles: [role] }));
      const skillErrors = result.errors.filter((e) => e.category === "skill-availability");
      expect(skillErrors).toHaveLength(0);
    });

    it("fails when required skill is not available in task or role", () => {
      const task = makeTask({
        requiredSkills: ["@clawforge/skill-missing"],
        skills: [], // not resolved in task
      });
      const role = makeRole({
        tasks: [task],
        skills: [], // not in role either
      });

      const result = validateAgent(makeAgent({ roles: [role] }));
      expect(result.valid).toBe(false);
      const skillErrors = result.errors.filter((e) => e.category === "skill-availability");
      expect(skillErrors).toHaveLength(1);
      expect(skillErrors[0].context.skill).toBe("@clawforge/skill-missing");
      expect(skillErrors[0].context.task).toBe("@clawforge/task-triage-issue");
      expect(skillErrors[0].context.role).toBe("@clawforge/role-issue-manager");
    });

    it("passes when task has no required skills", () => {
      const task = makeTask({
        requiredSkills: undefined,
        skills: [],
      });
      const role = makeRole({
        tasks: [task],
        skills: [],
      });

      const result = validateAgent(makeAgent({ roles: [role] }));
      const skillErrors = result.errors.filter((e) => e.category === "skill-availability");
      expect(skillErrors).toHaveLength(0);
    });
  });

  describe("app launch config", () => {
    it("fails when stdio app is missing command", () => {
      const badApp = makeApp({
        name: "@clawforge/app-broken",
        transport: "stdio",
        command: undefined,
        args: ["-y", "some-package"],
      });

      const role = makeRole({
        permissions: {
          "@clawforge/app-broken": { allow: ["create_issue"], deny: [] },
        },
        apps: [badApp],
        tasks: [makeTask({ apps: [badApp] })],
      });

      const result = validateAgent(makeAgent({ roles: [role] }));
      const configErrors = result.errors.filter((e) => e.category === "app-launch-config");
      expect(configErrors.length).toBeGreaterThanOrEqual(1);
      expect(configErrors.some((e) => e.context.field === "command")).toBe(true);
    });

    it("fails when stdio app is missing args", () => {
      const badApp = makeApp({
        name: "@clawforge/app-broken",
        transport: "stdio",
        command: "npx",
        args: undefined,
      });

      const role = makeRole({
        permissions: {
          "@clawforge/app-broken": { allow: ["create_issue"], deny: [] },
        },
        apps: [badApp],
        tasks: [makeTask({ apps: [badApp] })],
      });

      const result = validateAgent(makeAgent({ roles: [role] }));
      const configErrors = result.errors.filter((e) => e.category === "app-launch-config");
      expect(configErrors.length).toBeGreaterThanOrEqual(1);
      expect(configErrors.some((e) => e.context.field === "args")).toBe(true);
    });

    it("fails when SSE app is missing url", () => {
      const badApp = makeApp({
        name: "@clawforge/app-remote",
        transport: "sse",
        command: undefined,
        args: undefined,
        url: undefined,
      });

      const role = makeRole({
        permissions: {
          "@clawforge/app-remote": { allow: ["search"], deny: [] },
        },
        apps: [badApp],
        tasks: [makeTask({ apps: [badApp] })],
      });

      const result = validateAgent(makeAgent({ roles: [role] }));
      const configErrors = result.errors.filter((e) => e.category === "app-launch-config");
      expect(configErrors.length).toBeGreaterThanOrEqual(1);
      expect(configErrors.some((e) => e.context.field === "url")).toBe(true);
    });

    it("passes for valid stdio app", () => {
      const result = validateAgent(makeAgent());
      const configErrors = result.errors.filter((e) => e.category === "app-launch-config");
      expect(configErrors).toHaveLength(0);
    });

    it("passes for valid SSE app", () => {
      const sseApp = makeApp({
        name: "@clawforge/app-amap",
        transport: "sse",
        command: undefined,
        args: undefined,
        url: "https://mcp.amap.com/sse",
        tools: ["get_directions"],
      });

      const role = makeRole({
        permissions: {
          "@clawforge/app-amap": { allow: ["get_directions"], deny: [] },
        },
        apps: [sseApp],
        tasks: [],
        skills: [],
      });

      const result = validateAgent(makeAgent({ roles: [role] }));
      const configErrors = result.errors.filter((e) => e.category === "app-launch-config");
      expect(configErrors).toHaveLength(0);
    });
  });

  describe("collect all errors", () => {
    it("collects errors from multiple categories", () => {
      const badApp = makeApp({
        name: "@clawforge/app-broken",
        transport: "stdio",
        command: undefined, // launch config error
        args: undefined,    // launch config error
        tools: ["real_tool"],
      });

      const slackApp = makeApp({
        name: "@clawforge/app-slack",
        tools: ["send_message"],
      });

      const role = makeRole({
        permissions: {
          "@clawforge/app-github": {
            allow: ["create_issue", "phantom_tool"], // tool existence error
            deny: [],
          },
          "@clawforge/app-broken": {
            allow: ["real_tool"],
            deny: [],
          },
        },
        tasks: [makeTask({
          apps: [makeApp(), slackApp], // requirement coverage error: slack not in permissions
        })],
        apps: [makeApp(), badApp],
      });

      const result = validateAgent(makeAgent({ roles: [role] }));
      expect(result.valid).toBe(false);

      const categories = new Set(result.errors.map((e) => e.category));
      expect(categories.has("requirement-coverage")).toBe(true);
      expect(categories.has("tool-existence")).toBe(true);
      expect(categories.has("app-launch-config")).toBe(true);
    });
  });
});
