import { describe, it, expect } from "vitest";
import { validateAgent } from "../../src/validator/validate.js";
import type { ResolvedAgent, ResolvedApp, ResolvedRole, ResolvedSkill, ResolvedTask } from "@clawmasons/shared";

// --- Test helpers ---

function makeApp(overrides: Partial<ResolvedApp> = {}): ResolvedApp {
  return {
    name: "@clawmasons/app-github",
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
    name: "@clawmasons/skill-labeling",
    version: "1.0.0",
    artifacts: ["./SKILL.md"],
    description: "Issue labeling taxonomy",
    ...overrides,
  };
}

function makeTask(overrides: Partial<ResolvedTask> = {}): ResolvedTask {
  return {
    name: "@clawmasons/task-triage-issue",
    version: "1.0.0",
    taskType: "subagent",
    prompt: "./prompts/triage.md",
    requiredApps: ["@clawmasons/app-github"],
    requiredSkills: ["@clawmasons/skill-labeling"],
    apps: [makeApp()],
    skills: [makeSkill()],
    subTasks: [],
    ...overrides,
  };
}

function makeRole(overrides: Partial<ResolvedRole> = {}): ResolvedRole {
  return {
    name: "@clawmasons/role-issue-manager",
    version: "1.0.0",
    description: "Manages GitHub issues",
    permissions: {
      "@clawmasons/app-github": {
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

function makeMember(overrides: Partial<ResolvedAgent> = {}): ResolvedAgent {
  return {
    name: "@clawmasons/agent-repo-ops",
    version: "1.0.0",
    agentName: "Repo Ops",
    slug: "repo-ops",
    description: "Repository operations member",
    runtimes: ["claude-code"],
    roles: [makeRole()],
    ...overrides,
  };
}

// --- Tests ---

describe("validateAgent", () => {
  describe("valid agents", () => {
    it("returns valid for a well-formed agent", () => {
      const result = validateAgent(makeMember());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it("validates PRD repo-ops agent example", () => {
      const githubApp = makeApp({
        name: "@clawmasons/app-github",
        tools: ["create_issue", "list_repos", "create_pr", "get_pr", "create_review", "add_label", "delete_repo", "transfer_repo"],
      });

      const slackApp = makeApp({
        name: "@clawmasons/app-slack",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-slack"],
        tools: ["send_message"],
        capabilities: ["tools"],
      });

      const skill = makeSkill();

      const issueManagerRole = makeRole({
        name: "@clawmasons/role-issue-manager",
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
        tasks: [
          makeTask({
            name: "@clawmasons/task-triage-issue",
            requiredApps: ["@clawmasons/app-github"],
            requiredSkills: ["@clawmasons/skill-labeling"],
            apps: [githubApp],
            skills: [skill],
          }),
        ],
        apps: [githubApp, slackApp],
        skills: [skill],
      });

      const prReviewerRole = makeRole({
        name: "@clawmasons/role-pr-reviewer",
        permissions: {
          "@clawmasons/app-github": {
            allow: ["list_repos", "get_pr", "create_review"],
            deny: [],
          },
        },
        tasks: [],
        apps: [githubApp],
        skills: [],
      });

      const agent = makeMember({
        roles: [issueManagerRole, prReviewerRole],
        runtimes: ["claude-code", "codex"],
      });

      const result = validateAgent(agent);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("returns valid for agent with no tasks in roles", () => {
      const result = validateAgent(makeMember({
        roles: [makeRole({ tasks: [], skills: [] })],
      }));
      expect(result.valid).toBe(true);
    });
  });

  describe("requirement coverage", () => {
    it("fails when task requires app not in role permissions", () => {
      const slackApp = makeApp({
        name: "@clawmasons/app-slack",
        tools: ["send_message"],
      });

      const task = makeTask({
        apps: [makeApp(), slackApp], // task requires both github and slack
      });

      // Role only has permissions for github, not slack
      const role = makeRole({
        tasks: [task],
      });

      const result = validateAgent(makeMember({ roles: [role] }));
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].category).toBe("requirement-coverage");
      expect(result.errors[0].context.app).toBe("@clawmasons/app-slack");
      expect(result.errors[0].context.task).toBe("@clawmasons/task-triage-issue");
      expect(result.errors[0].context.role).toBe("@clawmasons/role-issue-manager");
    });

    it("checks sub-task requirement coverage recursively", () => {
      const slackApp = makeApp({
        name: "@clawmasons/app-slack",
        tools: ["send_message"],
      });

      const subTask = makeTask({
        name: "@clawmasons/task-notify",
        apps: [slackApp],
        skills: [],
        requiredSkills: [],
        subTasks: [],
      });

      const compositeTask = makeTask({
        name: "@clawmasons/task-triage-and-notify",
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

      const result = validateAgent(makeMember({ roles: [role] }));
      expect(result.valid).toBe(false);
      const coverageErrors = result.errors.filter((e) => e.category === "requirement-coverage");
      expect(coverageErrors).toHaveLength(1);
      expect(coverageErrors[0].context.app).toBe("@clawmasons/app-slack");
      expect(coverageErrors[0].context.task).toBe("@clawmasons/task-notify");
    });

    it("passes when task requires app covered by role permissions", () => {
      const result = validateAgent(makeMember());
      const coverageErrors = result.errors.filter((e) => e.category === "requirement-coverage");
      expect(coverageErrors).toHaveLength(0);
    });
  });

  describe("tool existence", () => {
    it("fails when role allows a tool not exposed by app", () => {
      const role = makeRole({
        permissions: {
          "@clawmasons/app-github": {
            allow: ["create_issue", "nonexistent_tool"],
            deny: [],
          },
        },
      });

      const result = validateAgent(makeMember({ roles: [role] }));
      expect(result.valid).toBe(false);
      const toolErrors = result.errors.filter((e) => e.category === "tool-existence");
      expect(toolErrors).toHaveLength(1);
      expect(toolErrors[0].context.tool).toBe("nonexistent_tool");
      expect(toolErrors[0].context.app).toBe("@clawmasons/app-github");
      expect(toolErrors[0].context.role).toBe("@clawmasons/role-issue-manager");
    });

    it("reports multiple missing tools", () => {
      const role = makeRole({
        permissions: {
          "@clawmasons/app-github": {
            allow: ["fake_tool_1", "fake_tool_2", "create_issue"],
            deny: [],
          },
        },
      });

      const result = validateAgent(makeMember({ roles: [role] }));
      const toolErrors = result.errors.filter((e) => e.category === "tool-existence");
      expect(toolErrors).toHaveLength(2);
      expect(toolErrors.map((e) => e.context.tool).sort()).toEqual(["fake_tool_1", "fake_tool_2"]);
    });

    it("passes when all allowed tools exist in app", () => {
      const result = validateAgent(makeMember());
      const toolErrors = result.errors.filter((e) => e.category === "tool-existence");
      expect(toolErrors).toHaveLength(0);
    });
  });

  describe("skill availability", () => {
    it("passes when task skill is available in task resolution", () => {
      const result = validateAgent(makeMember());
      const skillErrors = result.errors.filter((e) => e.category === "skill-availability");
      expect(skillErrors).toHaveLength(0);
    });

    it("passes when task skill is available via parent role", () => {
      const skill = makeSkill();
      const task = makeTask({
        requiredSkills: ["@clawmasons/skill-labeling"],
        skills: [], // NOT in task's resolved skills
      });
      const role = makeRole({
        tasks: [task],
        skills: [skill], // but IS in the role's skills
      });

      const result = validateAgent(makeMember({ roles: [role] }));
      const skillErrors = result.errors.filter((e) => e.category === "skill-availability");
      expect(skillErrors).toHaveLength(0);
    });

    it("fails when required skill is not available in task or role", () => {
      const task = makeTask({
        requiredSkills: ["@clawmasons/skill-missing"],
        skills: [], // not resolved in task
      });
      const role = makeRole({
        tasks: [task],
        skills: [], // not in role either
      });

      const result = validateAgent(makeMember({ roles: [role] }));
      expect(result.valid).toBe(false);
      const skillErrors = result.errors.filter((e) => e.category === "skill-availability");
      expect(skillErrors).toHaveLength(1);
      expect(skillErrors[0].context.skill).toBe("@clawmasons/skill-missing");
      expect(skillErrors[0].context.task).toBe("@clawmasons/task-triage-issue");
      expect(skillErrors[0].context.role).toBe("@clawmasons/role-issue-manager");
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

      const result = validateAgent(makeMember({ roles: [role] }));
      const skillErrors = result.errors.filter((e) => e.category === "skill-availability");
      expect(skillErrors).toHaveLength(0);
    });
  });

  describe("app launch config", () => {
    it("fails when stdio app is missing command", () => {
      const badApp = makeApp({
        name: "@clawmasons/app-broken",
        transport: "stdio",
        command: undefined,
        args: ["-y", "some-package"],
      });

      const role = makeRole({
        permissions: {
          "@clawmasons/app-broken": { allow: ["create_issue"], deny: [] },
        },
        apps: [badApp],
        tasks: [makeTask({ apps: [badApp] })],
      });

      const result = validateAgent(makeMember({ roles: [role] }));
      const configErrors = result.errors.filter((e) => e.category === "app-launch-config");
      expect(configErrors.length).toBeGreaterThanOrEqual(1);
      expect(configErrors.some((e) => e.context.field === "command")).toBe(true);
    });

    it("fails when stdio app is missing args", () => {
      const badApp = makeApp({
        name: "@clawmasons/app-broken",
        transport: "stdio",
        command: "npx",
        args: undefined,
      });

      const role = makeRole({
        permissions: {
          "@clawmasons/app-broken": { allow: ["create_issue"], deny: [] },
        },
        apps: [badApp],
        tasks: [makeTask({ apps: [badApp] })],
      });

      const result = validateAgent(makeMember({ roles: [role] }));
      const configErrors = result.errors.filter((e) => e.category === "app-launch-config");
      expect(configErrors.length).toBeGreaterThanOrEqual(1);
      expect(configErrors.some((e) => e.context.field === "args")).toBe(true);
    });

    it("fails when SSE app is missing url", () => {
      const badApp = makeApp({
        name: "@clawmasons/app-remote",
        transport: "sse",
        command: undefined,
        args: undefined,
        url: undefined,
      });

      const role = makeRole({
        permissions: {
          "@clawmasons/app-remote": { allow: ["search"], deny: [] },
        },
        apps: [badApp],
        tasks: [makeTask({ apps: [badApp] })],
      });

      const result = validateAgent(makeMember({ roles: [role] }));
      const configErrors = result.errors.filter((e) => e.category === "app-launch-config");
      expect(configErrors.length).toBeGreaterThanOrEqual(1);
      expect(configErrors.some((e) => e.context.field === "url")).toBe(true);
    });

    it("passes for valid stdio app", () => {
      const result = validateAgent(makeMember());
      const configErrors = result.errors.filter((e) => e.category === "app-launch-config");
      expect(configErrors).toHaveLength(0);
    });

    it("passes for valid SSE app", () => {
      const sseApp = makeApp({
        name: "@clawmasons/app-amap",
        transport: "sse",
        command: undefined,
        args: undefined,
        url: "https://mcp.amap.com/sse",
        tools: ["get_directions"],
      });

      const role = makeRole({
        permissions: {
          "@clawmasons/app-amap": { allow: ["get_directions"], deny: [] },
        },
        apps: [sseApp],
        tasks: [],
        skills: [],
      });

      const result = validateAgent(makeMember({ roles: [role] }));
      const configErrors = result.errors.filter((e) => e.category === "app-launch-config");
      expect(configErrors).toHaveLength(0);
    });
  });

  describe("llm-config", () => {
    it("errors when pi-coding-agent runtime has no llm config", () => {
      const result = validateAgent(makeMember({
        runtimes: ["pi-coding-agent"],
        // no llm field
      }));
      expect(result.valid).toBe(false);
      const llmErrors = result.errors.filter((e) => e.category === "llm-config");
      expect(llmErrors).toHaveLength(1);
      expect(llmErrors[0].message).toContain("pi-coding-agent");
      expect(llmErrors[0].message).toContain("no \"llm\" configuration");
      expect(llmErrors[0].context.agent).toBe("@clawmasons/agent-repo-ops");
      expect(llmErrors[0].context.runtime).toBe("pi-coding-agent");
      expect(result.warnings).toHaveLength(0);
    });

    it("passes when pi-coding-agent runtime has llm config", () => {
      const result = validateAgent(makeMember({
        runtimes: ["pi-coding-agent"],
        llm: { provider: "openrouter", model: "anthropic/claude-sonnet-4" },
      }));
      const llmErrors = result.errors.filter((e) => e.category === "llm-config");
      expect(llmErrors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it("warns when claude-code runtime has llm config", () => {
      const result = validateAgent(makeMember({
        runtimes: ["claude-code"],
        llm: { provider: "openrouter", model: "anthropic/claude-sonnet-4" },
      }));
      expect(result.valid).toBe(true); // warnings don't affect validity
      expect(result.errors.filter((e) => e.category === "llm-config")).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].category).toBe("llm-config");
      expect(result.warnings[0].message).toContain("claude-code");
      expect(result.warnings[0].message).toContain("will be ignored");
      expect(result.warnings[0].context.agent).toBe("@clawmasons/agent-repo-ops");
      expect(result.warnings[0].context.runtime).toBe("claude-code");
    });

    it("no warning when claude-code runtime has no llm config", () => {
      const result = validateAgent(makeMember({
        runtimes: ["claude-code"],
        // no llm field — default behavior
      }));
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it("errors for pi and warns for claude-code when both runtimes present without llm", () => {
      const result = validateAgent(makeMember({
        runtimes: ["pi-coding-agent", "claude-code"],
        // no llm — pi needs it, claude-code is fine
      }));
      expect(result.valid).toBe(false);
      const llmErrors = result.errors.filter((e) => e.category === "llm-config");
      expect(llmErrors).toHaveLength(1);
      expect(llmErrors[0].context.runtime).toBe("pi-coding-agent");
      expect(result.warnings).toHaveLength(0); // no llm → no claude-code warning
    });

    it("warns for claude-code when both runtimes present with llm", () => {
      const result = validateAgent(makeMember({
        runtimes: ["pi-coding-agent", "claude-code"],
        llm: { provider: "openrouter", model: "anthropic/claude-sonnet-4" },
      }));
      expect(result.valid).toBe(true); // pi is satisfied, claude-code just warns
      const llmErrors = result.errors.filter((e) => e.category === "llm-config");
      expect(llmErrors).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].context.runtime).toBe("claude-code");
    });

    it("skips llm check for human members", () => {
      const result = validateAgent(makeMember({
        runtimes: [], // humans don't have runtimes
      }));
      // Human members should not trigger any llm-config errors or warnings
      const llmErrors = result.errors.filter((e) => e.category === "llm-config");
      expect(llmErrors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it("no error for unknown runtime without llm config", () => {
      const result = validateAgent(makeMember({
        runtimes: ["codex"],
        // no llm — codex is not pi-coding-agent, so no error
      }));
      const llmErrors = result.errors.filter((e) => e.category === "llm-config");
      expect(llmErrors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe("collect all errors", () => {
    it("collects errors from multiple categories", () => {
      const badApp = makeApp({
        name: "@clawmasons/app-broken",
        transport: "stdio",
        command: undefined, // launch config error
        args: undefined,    // launch config error
        tools: ["real_tool"],
      });

      const slackApp = makeApp({
        name: "@clawmasons/app-slack",
        tools: ["send_message"],
      });

      const role = makeRole({
        permissions: {
          "@clawmasons/app-github": {
            allow: ["create_issue", "phantom_tool"], // tool existence error
            deny: [],
          },
          "@clawmasons/app-broken": {
            allow: ["real_tool"],
            deny: [],
          },
        },
        tasks: [makeTask({
          apps: [makeApp(), slackApp], // requirement coverage error: slack not in permissions
        })],
        apps: [makeApp(), badApp],
      });

      const result = validateAgent(makeMember({ roles: [role] }));
      expect(result.valid).toBe(false);

      const categories = new Set(result.errors.map((e) => e.category));
      expect(categories.has("requirement-coverage")).toBe(true);
      expect(categories.has("tool-existence")).toBe(true);
      expect(categories.has("app-launch-config")).toBe(true);
    });
  });
});
