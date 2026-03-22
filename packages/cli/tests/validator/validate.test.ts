import { describe, it, expect } from "vitest";
import { validateAgent } from "../../src/validator/validate.js";
import type { ResolvedAgent, ResolvedApp, ResolvedRole, ResolvedSkill, ResolvedTask } from "@clawmasons/shared";
import type { AgentPackage, AgentRegistry } from "@clawmasons/agent-sdk";
import piCodingAgent from "@clawmasons/pi-coding-agent";
import claudeCodeAgent from "@clawmasons/claude-code-agent";

// --- Mock agent registry ---

function createMockRegistry(): AgentRegistry {
  const registry: AgentRegistry = new Map();
  registry.set("pi-coding-agent", piCodingAgent);
  registry.set("claude-code-agent", claudeCodeAgent);
  return registry;
}

const mockRegistry = createMockRegistry();

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
    credentials: [],
    location: "proxy",
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
    prompt: "./prompts/triage.md",
    ...overrides,
  };
}

function makeRole(overrides: Partial<ResolvedRole> = {}): ResolvedRole {
  return {
    name: "@clawmasons/role-issue-manager",
    version: "1.0.0",
    risk: "LOW",
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
    runtimes: ["claude-code-agent"],
    credentials: [],
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
        runtimes: ["claude-code-agent", "codex"],
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
        tasks: [makeTask()],
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
        tasks: [makeTask()],
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
        tasks: [makeTask()],
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
      }), mockRegistry);
      expect(result.valid).toBe(false);
      const llmErrors = result.errors.filter((e) => e.category === "llm-config");
      expect(llmErrors).toHaveLength(1);
      expect(llmErrors[0].message).toContain("pi-coding-agent");
      expect(llmErrors[0].message).toContain("no LLM configuration");
      expect(llmErrors[0].context.agent).toBe("@clawmasons/agent-repo-ops");
      expect(llmErrors[0].context.runtime).toBe("pi-coding-agent");
      expect(result.warnings).toHaveLength(0);
    });

    it("passes when pi-coding-agent runtime has llm config", () => {
      const result = validateAgent(makeMember({
        runtimes: ["pi-coding-agent"],
        llm: { provider: "openrouter", model: "anthropic/claude-sonnet-4" },
      }), mockRegistry);
      const llmErrors = result.errors.filter((e) => e.category === "llm-config");
      expect(llmErrors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it("warns when claude-code-agent runtime has llm config", () => {
      const result = validateAgent(makeMember({
        runtimes: ["claude-code-agent"],
        llm: { provider: "openrouter", model: "anthropic/claude-sonnet-4" },
      }), mockRegistry);
      expect(result.valid).toBe(true); // warnings don't affect validity
      expect(result.errors.filter((e) => e.category === "llm-config")).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].category).toBe("llm-config");
      expect(result.warnings[0].message).toContain("claude-code-agent");
      expect(result.warnings[0].message).toContain("will be ignored");
      expect(result.warnings[0].context.agent).toBe("@clawmasons/agent-repo-ops");
      expect(result.warnings[0].context.runtime).toBe("claude-code-agent");
    });

    it("no warning when claude-code-agent runtime has no llm config", () => {
      const result = validateAgent(makeMember({
        runtimes: ["claude-code-agent"],
        // no llm field — default behavior
      }), mockRegistry);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it("errors for pi and warns for claude-code-agent when both runtimes present without llm", () => {
      const result = validateAgent(makeMember({
        runtimes: ["pi-coding-agent", "claude-code-agent"],
        // no llm — pi needs it, claude-code-agent is fine
      }), mockRegistry);
      expect(result.valid).toBe(false);
      const llmErrors = result.errors.filter((e) => e.category === "llm-config");
      expect(llmErrors).toHaveLength(1);
      expect(llmErrors[0].context.runtime).toBe("pi-coding-agent");
      expect(result.warnings).toHaveLength(0); // no llm → no claude-code-agent warning
    });

    it("warns for claude-code-agent when both runtimes present with llm", () => {
      const result = validateAgent(makeMember({
        runtimes: ["pi-coding-agent", "claude-code-agent"],
        llm: { provider: "openrouter", model: "anthropic/claude-sonnet-4" },
      }), mockRegistry);
      expect(result.valid).toBe(true); // pi is satisfied, claude-code-agent just warns
      const llmErrors = result.errors.filter((e) => e.category === "llm-config");
      expect(llmErrors).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].context.runtime).toBe("claude-code-agent");
    });

    it("skips llm check for human members", () => {
      const result = validateAgent(makeMember({
        runtimes: [], // humans don't have runtimes
      }), mockRegistry);
      // Human members should not trigger any llm-config errors or warnings
      const llmErrors = result.errors.filter((e) => e.category === "llm-config");
      expect(llmErrors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it("no error for unknown runtime without llm config", () => {
      const result = validateAgent(makeMember({
        runtimes: ["codex"],
        // no llm — codex is not pi-coding-agent, so no error
      }), mockRegistry);
      const llmErrors = result.errors.filter((e) => e.category === "llm-config");
      expect(llmErrors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe("delegated agent validation", () => {
    it("skips agent-specific validation when no registry provided", () => {
      // Without registry, no agent-specific validation runs (backward compat)
      const result = validateAgent(makeMember({
        runtimes: ["pi-coding-agent"],
        // no llm — would normally error, but no registry
      }));
      const llmErrors = result.errors.filter((e) => e.category === "llm-config");
      expect(llmErrors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it("handles agent package without validate function", () => {
      const noValidatePkg = {
        name: "no-validate-agent",
        // no validate function
      } as unknown as AgentPackage;
      const registry: AgentRegistry = new Map();
      registry.set("no-validate-agent", noValidatePkg);

      const result = validateAgent(makeMember({
        runtimes: ["no-validate-agent"],
      }), registry);
      const llmErrors = result.errors.filter((e) => e.category === "llm-config");
      expect(llmErrors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it("deduplicates validate calls for same agent package", () => {
      let callCount = 0;
      const countingPkg = {
        name: "counting-agent",
        validate: () => {
          callCount++;
          return { errors: [], warnings: [] };
        },
      } as unknown as AgentPackage;
      const registry: AgentRegistry = new Map();
      // Register same package under two runtime names
      registry.set("runtime-a", countingPkg);
      registry.set("runtime-b", countingPkg);

      validateAgent(makeMember({
        runtimes: ["runtime-a", "runtime-b"],
      }), registry);
      expect(callCount).toBe(1); // deduplicated by AgentPackage.name
    });

    it("calls validate for each distinct agent package", () => {
      const calls: string[] = [];
      const pkgA = {
        name: "agent-a",
        validate: () => {
          calls.push("a");
          return { errors: [], warnings: [] };
        },
      } as unknown as AgentPackage;
      const pkgB = {
        name: "agent-b",
        validate: () => {
          calls.push("b");
          return { errors: [], warnings: [] };
        },
      } as unknown as AgentPackage;
      const registry: AgentRegistry = new Map();
      registry.set("runtime-a", pkgA);
      registry.set("runtime-b", pkgB);

      validateAgent(makeMember({
        runtimes: ["runtime-a", "runtime-b"],
      }), registry);
      expect(calls).toEqual(["a", "b"]);
    });
  });

  describe("credential coverage", () => {
    it("no warnings when agent declares all app credentials", () => {
      const app = makeApp({
        name: "@clawmasons/app-web-search",
        credentials: ["SERP_API_KEY"],
      });
      const role = makeRole({
        apps: [app],
        tasks: [],
        skills: [],
        permissions: {
          "@clawmasons/app-web-search": { allow: [], deny: [] },
        },
      });
      const agent = makeMember({
        credentials: ["SERP_API_KEY"],
        roles: [role],
      });

      const result = validateAgent(agent);
      const credWarnings = result.warnings.filter((w) => w.category === "credential-coverage");
      expect(credWarnings).toHaveLength(0);
    });

    it("warns when agent is missing an app credential", () => {
      const app = makeApp({
        name: "@clawmasons/app-web-search",
        credentials: ["SERP_API_KEY"],
      });
      const role = makeRole({
        apps: [app],
        tasks: [],
        skills: [],
        permissions: {
          "@clawmasons/app-web-search": { allow: [], deny: [] },
        },
      });
      const agent = makeMember({
        credentials: [],
        roles: [role],
      });

      const result = validateAgent(agent);
      expect(result.valid).toBe(true); // warnings don't affect validity
      const credWarnings = result.warnings.filter((w) => w.category === "credential-coverage");
      expect(credWarnings).toHaveLength(1);
      expect(credWarnings[0].message).toContain("SERP_API_KEY");
      expect(credWarnings[0].message).toContain("@clawmasons/app-web-search");
      expect(credWarnings[0].message).toContain("Repo Ops");
      expect(credWarnings[0].context.agent).toBe("@clawmasons/agent-repo-ops");
      expect(credWarnings[0].context.credential).toBe("SERP_API_KEY");
      expect(credWarnings[0].context.app).toBe("@clawmasons/app-web-search");
    });

    it("no warnings when both agent and apps have no credentials", () => {
      const app = makeApp({ credentials: [] });
      const role = makeRole({ apps: [app] });
      const agent = makeMember({ credentials: [], roles: [role] });

      const result = validateAgent(agent);
      const credWarnings = result.warnings.filter((w) => w.category === "credential-coverage");
      expect(credWarnings).toHaveLength(0);
    });

    it("warns per app-credential pair for multiple apps", () => {
      const app1 = makeApp({
        name: "@clawmasons/app-web-search",
        credentials: ["SERP_API_KEY"],
      });
      const app2 = makeApp({
        name: "@clawmasons/app-openai",
        credentials: ["OPENAI_API_KEY", "SERP_API_KEY"],
      });
      const role = makeRole({
        apps: [app1, app2],
        tasks: [],
        skills: [],
        permissions: {
          "@clawmasons/app-web-search": { allow: [], deny: [] },
          "@clawmasons/app-openai": { allow: [], deny: [] },
        },
      });
      const agent = makeMember({
        credentials: [],
        roles: [role],
      });

      const result = validateAgent(agent);
      const credWarnings = result.warnings.filter((w) => w.category === "credential-coverage");
      // app1 needs SERP_API_KEY, app2 needs OPENAI_API_KEY and SERP_API_KEY = 3 warnings
      expect(credWarnings).toHaveLength(3);
    });

    it("no warnings when agent has extra credentials beyond app needs", () => {
      const app = makeApp({
        name: "@clawmasons/app-web-search",
        credentials: ["SERP_API_KEY"],
      });
      const role = makeRole({
        apps: [app],
        tasks: [],
        skills: [],
        permissions: {
          "@clawmasons/app-web-search": { allow: [], deny: [] },
        },
      });
      const agent = makeMember({
        credentials: ["SERP_API_KEY", "EXTRA_KEY"],
        roles: [role],
      });

      const result = validateAgent(agent);
      const credWarnings = result.warnings.filter((w) => w.category === "credential-coverage");
      expect(credWarnings).toHaveLength(0);
    });

    it("checks credentials across multiple roles", () => {
      const app1 = makeApp({
        name: "@clawmasons/app-web-search",
        credentials: ["SERP_API_KEY"],
      });
      const app2 = makeApp({
        name: "@clawmasons/app-slack",
        credentials: ["SLACK_TOKEN"],
      });
      const role1 = makeRole({
        name: "@clawmasons/role-researcher",
        apps: [app1],
        tasks: [],
        skills: [],
        permissions: {
          "@clawmasons/app-web-search": { allow: [], deny: [] },
        },
      });
      const role2 = makeRole({
        name: "@clawmasons/role-communicator",
        apps: [app2],
        tasks: [],
        skills: [],
        permissions: {
          "@clawmasons/app-slack": { allow: [], deny: [] },
        },
      });
      const agent = makeMember({
        credentials: ["SERP_API_KEY"], // missing SLACK_TOKEN
        roles: [role1, role2],
      });

      const result = validateAgent(agent);
      const credWarnings = result.warnings.filter((w) => w.category === "credential-coverage");
      expect(credWarnings).toHaveLength(1);
      expect(credWarnings[0].context.credential).toBe("SLACK_TOKEN");
      expect(credWarnings[0].context.app).toBe("@clawmasons/app-slack");
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
        tasks: [makeTask()],
        apps: [makeApp(), badApp],
      });

      const result = validateAgent(makeMember({ roles: [role] }));
      expect(result.valid).toBe(false);

      const categories = new Set(result.errors.map((e) => e.category));
      expect(categories.has("tool-existence")).toBe(true);
      expect(categories.has("app-launch-config")).toBe(true);
    });
  });
});
