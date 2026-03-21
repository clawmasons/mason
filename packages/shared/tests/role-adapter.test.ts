import { describe, it, expect } from "vitest";
import {
  adaptRoleToResolvedAgent,
  AdapterError,
  roleSchema,
} from "@clawmasons/shared";
import type { Role } from "@clawmasons/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal valid Role for testing. Raw overrides are parsed through Zod. */
function minimalRole(overrides: Record<string, unknown> = {}): Role {
  const raw = overrides as Record<string, unknown>;
  return roleSchema.parse({
    metadata: {
      name: "test-role",
      description: "A test role",
      ...((raw.metadata as Record<string, unknown>) ?? {}),
    },
    instructions: raw.instructions ?? "You are a test agent.",
    tasks: raw.tasks ?? [],
    apps: raw.apps ?? [],
    skills: raw.skills ?? [],
    container: raw.container ?? {},
    governance: raw.governance ?? {},
    resources: raw.resources ?? [],
    source: raw.source ?? { type: "local", agentDialect: "claude-code-agent", path: "/tmp/test" },
  });
}

/** Build a fully-populated Role. */
function fullRole(): Role {
  return roleSchema.parse({
    metadata: {
      name: "create-prd",
      description: "Creates PRDs",
      version: "1.2.3",
      scope: "acme.engineering",
    },
    instructions: "You are a PRD author.",
    tasks: [
      { name: "define-change" },
      { name: "review-change", ref: "./tasks/review" },
    ],
    apps: [
      {
        name: "github",
        transport: "streamable-http",
        url: "http://localhost:3000",
        env: { GH_TOKEN: "xxx" },
        tools: {
          allow: ["create_issue", "list_repos"],
          deny: ["delete_repo"],
        },
        credentials: ["GITHUB_TOKEN"],
      },
      {
        name: "slack",
        transport: "stdio",
        command: "node",
        args: ["server.js"],
        tools: {
          allow: ["send_message"],
        },
      },
    ],
    skills: [
      { name: "prd-writing", ref: "@acme/skill-prd-writing" },
      { name: "markdown" },
    ],
    container: {
      packages: {
        apt: ["jq", "curl"],
        npm: ["typescript"],
        pip: ["pdfkit"],
      },
      ignore: {
        paths: [".mason/", ".env"],
      },
      mounts: [
        { source: "./data", target: "/workspace/data", readonly: true },
      ],
      baseImage: "node:22-slim",
    },
    governance: {
      risk: "HIGH",
      credentials: ["GITHUB_TOKEN", "ANTHROPIC_API_KEY"],
      constraints: {
        maxConcurrentTasks: 3,
        requireApprovalFor: ["create_pr"],
      },
    },
    resources: [
      {
        relativePath: "templates/prd-template.md",
        absolutePath: "/home/user/project/.claude/roles/create-prd/templates/prd-template.md",
      },
    ],
    source: {
      type: "local",
      agentDialect: "claude-code-agent",
      path: "/home/user/project/.claude/roles/create-prd",
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("adaptRoleToResolvedAgent", () => {
  // ---- Basic adaptation ----

  describe("basic adaptation", () => {
    it("produces a valid ResolvedAgent from a minimal Role", () => {
      const role = minimalRole();
      const agent = adaptRoleToResolvedAgent(role, "claude-code-agent");

      expect(agent.name).toBe("test-role");
      expect(agent.version).toBe("0.0.0");
      expect(agent.agentName).toBe("test-role");
      expect(agent.slug).toBe("test-role");
      expect(agent.description).toBe("A test role");
      expect(agent.runtimes).toEqual(["claude-code-agent"]);
      expect(agent.credentials).toEqual([]);
      expect(agent.roles).toHaveLength(1);
      expect(agent.proxy).toEqual({ port: 9090, type: "streamable-http" });
    });

    it("preserves version from metadata", () => {
      const role = minimalRole({
        metadata: {
          name: "test-role",
          description: "A test role",
          version: "2.0.0",
        },
      });
      const agent = adaptRoleToResolvedAgent(role, "claude-code-agent");
      expect(agent.version).toBe("2.0.0");
      expect(agent.roles[0].version).toBe("2.0.0");
    });
  });

  // ---- Task mapping ----

  describe("task mapping", () => {
    it("maps TaskRefs to ResolvedTasks", () => {
      const role = minimalRole({
        tasks: [{ name: "define-change" }, { name: "review-change" }],
      });
      const agent = adaptRoleToResolvedAgent(role, "claude-code-agent");
      const tasks = agent.roles[0].tasks;

      expect(tasks).toHaveLength(2);
      expect(tasks[0].name).toBe("define-change");
      expect(tasks[0].version).toBe("0.0.0");
      expect(tasks[0].prompt).toBeUndefined();
      expect(tasks[1].name).toBe("review-change");
    });

    it("extracts scope from colon-delimited task names", () => {
      const role = minimalRole({
        tasks: [{ name: "opsx:apply" }],
      });
      const agent = adaptRoleToResolvedAgent(role, "claude-code-agent");
      const task = agent.roles[0].tasks[0];

      expect(task.name).toBe("apply");
      expect(task.scope).toBe("opsx");
    });

    it("extracts deeply nested scope from colon-delimited names", () => {
      const role = minimalRole({
        tasks: [{ name: "ops:triage:label" }],
      });
      const agent = adaptRoleToResolvedAgent(role, "claude-code-agent");
      const task = agent.roles[0].tasks[0];

      expect(task.name).toBe("label");
      expect(task.scope).toBe("ops:triage");
    });

    it("leaves unscoped task names unchanged", () => {
      const role = minimalRole({
        tasks: [{ name: "doc-cleanup" }],
      });
      const agent = adaptRoleToResolvedAgent(role, "claude-code-agent");
      const task = agent.roles[0].tasks[0];

      expect(task.name).toBe("doc-cleanup");
      expect(task.scope).toBeUndefined();
    });

    it("extracts scope from slash-delimited task names", () => {
      const role = minimalRole({
        tasks: [{ name: "opsx/apply" }],
      });
      const agent = adaptRoleToResolvedAgent(role, "claude-code-agent");
      const task = agent.roles[0].tasks[0];

      expect(task.name).toBe("apply");
      expect(task.scope).toBe("opsx");
    });

    it("extracts deeply nested scope from slash-delimited names", () => {
      const role = minimalRole({
        tasks: [{ name: "ops/triage/label-issue" }],
      });
      const agent = adaptRoleToResolvedAgent(role, "claude-code-agent");
      const task = agent.roles[0].tasks[0];

      expect(task.name).toBe("label-issue");
      expect(task.scope).toBe("ops:triage");
    });

    it("handles mixed colon and slash delimiters", () => {
      const role = minimalRole({
        tasks: [{ name: "ops/triage:label" }],
      });
      const agent = adaptRoleToResolvedAgent(role, "claude-code-agent");
      const task = agent.roles[0].tasks[0];

      expect(task.name).toBe("label");
      expect(task.scope).toBe("ops:triage");
    });
  });

  // ---- App mapping ----

  describe("app mapping", () => {
    it("maps AppConfigs to ResolvedApps", () => {
      const role = minimalRole({
        apps: [
          {
            name: "github",
            transport: "streamable-http",
            url: "http://localhost:3000",
            env: { GH_TOKEN: "xxx" },
            tools: { allow: ["create_issue"], deny: ["delete_repo"] },
            credentials: ["GITHUB_TOKEN"],
          },
        ],
      });
      const agent = adaptRoleToResolvedAgent(role, "claude-code-agent");
      const app = agent.roles[0].apps[0];

      expect(app.name).toBe("github");
      expect(app.version).toBe("0.0.0");
      expect(app.transport).toBe("streamable-http");
      expect(app.url).toBe("http://localhost:3000");
      expect(app.env).toEqual({ GH_TOKEN: "xxx" });
      expect(app.tools).toEqual(["create_issue"]);
      expect(app.capabilities).toEqual([]);
      expect(app.credentials).toEqual(["GITHUB_TOKEN"]);
    });

    it("defaults transport to stdio", () => {
      const role = minimalRole({
        apps: [{ name: "local-server" }],
      });
      const agent = adaptRoleToResolvedAgent(role, "claude-code-agent");
      expect(agent.roles[0].apps[0].transport).toBe("stdio");
    });
  });

  // ---- Permissions aggregation ----

  describe("permissions aggregation", () => {
    it("aggregates app tools into role permissions", () => {
      const role = minimalRole({
        apps: [
          {
            name: "github",
            tools: { allow: ["create_issue", "list_repos"], deny: ["delete_repo"] },
          },
          {
            name: "slack",
            tools: { allow: ["send_message"], deny: [] },
          },
        ],
      });
      const agent = adaptRoleToResolvedAgent(role, "claude-code-agent");
      const perms = agent.roles[0].permissions;

      expect(perms["github"]).toEqual({
        allow: ["create_issue", "list_repos"],
        deny: ["delete_repo"],
      });
      expect(perms["slack"]).toEqual({
        allow: ["send_message"],
        deny: [],
      });
    });

    it("uses empty arrays for apps without tool declarations", () => {
      const role = minimalRole({
        apps: [{ name: "bare-server" }],
      });
      const agent = adaptRoleToResolvedAgent(role, "claude-code-agent");
      expect(agent.roles[0].permissions["bare-server"]).toEqual({
        allow: [],
        deny: [],
      });
    });
  });

  // ---- Skill mapping ----

  describe("skill mapping", () => {
    it("maps SkillRefs to ResolvedSkills", () => {
      const role = minimalRole({
        skills: [
          { name: "prd-writing", ref: "@acme/skill-prd-writing" },
          { name: "markdown" },
        ],
      });
      const agent = adaptRoleToResolvedAgent(role, "claude-code-agent");
      const skills = agent.roles[0].skills;

      expect(skills).toHaveLength(2);
      expect(skills[0].name).toBe("prd-writing");
      expect(skills[0].version).toBe("0.0.0");
      expect(skills[0].artifacts).toEqual([]);
      expect(skills[0].description).toBe("prd-writing");
      expect(skills[1].name).toBe("markdown");
    });
  });

  // ---- Container requirements ----

  describe("container requirements", () => {
    it("maps apt packages", () => {
      const role = minimalRole({
        container: {
          packages: { apt: ["jq", "curl"] },
        },
      });
      const agent = adaptRoleToResolvedAgent(role, "claude-code-agent");
      expect(agent.roles[0].aptPackages).toEqual(["jq", "curl"]);
    });

    it("maps mounts", () => {
      const role = minimalRole({
        container: {
          mounts: [{ source: "./data", target: "/workspace/data", readonly: true }],
        },
      });
      const agent = adaptRoleToResolvedAgent(role, "claude-code-agent");
      expect(agent.roles[0].mounts).toEqual([
        { source: "./data", target: "/workspace/data", readonly: true },
      ]);
    });

    it("maps baseImage", () => {
      const role = minimalRole({
        container: { baseImage: "node:22-slim" },
      });
      const agent = adaptRoleToResolvedAgent(role, "claude-code-agent");
      expect(agent.roles[0].baseImage).toBe("node:22-slim");
    });

    it("omits aptPackages when empty", () => {
      const role = minimalRole({
        container: { packages: { apt: [] } },
      });
      const agent = adaptRoleToResolvedAgent(role, "claude-code-agent");
      expect(agent.roles[0].aptPackages).toBeUndefined();
    });

    it("maps npm packages", () => {
      const role = minimalRole({
        container: {
          packages: { npm: ["typescript", "@fission-ai/openspec@latest"] },
        },
      });
      const agent = adaptRoleToResolvedAgent(role, "claude-code-agent");
      expect(agent.roles[0].npmPackages).toEqual(["typescript", "@fission-ai/openspec@latest"]);
    });

    it("omits npmPackages when empty", () => {
      const role = minimalRole({
        container: { packages: { npm: [] } },
      });
      const agent = adaptRoleToResolvedAgent(role, "claude-code-agent");
      expect(agent.roles[0].npmPackages).toBeUndefined();
    });

    it("omits npmPackages when absent", () => {
      const role = minimalRole();
      const agent = adaptRoleToResolvedAgent(role, "claude-code-agent");
      expect(agent.roles[0].npmPackages).toBeUndefined();
    });
  });

  // ---- Governance ----

  describe("governance", () => {
    it("maps risk level", () => {
      const role = minimalRole({
        governance: { risk: "HIGH" },
      });
      const agent = adaptRoleToResolvedAgent(role, "claude-code-agent");
      expect(agent.roles[0].risk).toBe("HIGH");
    });

    it("defaults risk to LOW", () => {
      const role = minimalRole();
      const agent = adaptRoleToResolvedAgent(role, "claude-code-agent");
      expect(agent.roles[0].risk).toBe("LOW");
    });

    it("maps constraints", () => {
      const role = minimalRole({
        governance: {
          constraints: {
            maxConcurrentTasks: 3,
            requireApprovalFor: ["create_pr"],
          },
        },
      });
      const agent = adaptRoleToResolvedAgent(role, "claude-code-agent");
      expect(agent.roles[0].constraints).toEqual({
        maxConcurrentTasks: 3,
        requireApprovalFor: ["create_pr"],
      });
    });

    it("maps credentials to ResolvedAgent.credentials", () => {
      const role = minimalRole({
        governance: {
          credentials: ["GITHUB_TOKEN", "ANTHROPIC_API_KEY"],
        },
      });
      const agent = adaptRoleToResolvedAgent(role, "claude-code-agent");
      expect(agent.credentials).toEqual(["GITHUB_TOKEN", "ANTHROPIC_API_KEY"]);
    });
  });

  // ---- Agent type validation ----

  describe("agent type validation", () => {
    it("throws AdapterError for unknown agent type", () => {
      const role = minimalRole();
      expect(() => adaptRoleToResolvedAgent(role, "unknown-runtime")).toThrow(
        AdapterError,
      );
      expect(() => adaptRoleToResolvedAgent(role, "unknown-runtime")).toThrow(
        /Unknown agent type "unknown-runtime"/,
      );
    });

    it("accepts all registered dialects", () => {
      const role = minimalRole();
      for (const agentType of ["claude-code-agent", "codex", "aider", "mcp-agent"]) {
        const agent = adaptRoleToResolvedAgent(role, agentType);
        expect(agent.runtimes).toEqual([agentType]);
      }
    });
  });

  // ---- Full round-trip ----

  describe("full round-trip", () => {
    it("preserves all fields from a fully-populated Role", () => {
      const role = fullRole();
      const agent = adaptRoleToResolvedAgent(role, "claude-code-agent");

      // Top-level
      expect(agent.name).toBe("create-prd");
      expect(agent.version).toBe("1.2.3");
      expect(agent.description).toBe("Creates PRDs");
      expect(agent.runtimes).toEqual(["claude-code-agent"]);
      expect(agent.credentials).toEqual(["GITHUB_TOKEN", "ANTHROPIC_API_KEY"]);

      // Single role
      const resolvedRole = agent.roles[0];
      expect(resolvedRole.name).toBe("create-prd");
      expect(resolvedRole.risk).toBe("HIGH");

      // Tasks
      expect(resolvedRole.tasks).toHaveLength(2);
      expect(resolvedRole.tasks[0].name).toBe("define-change");
      expect(resolvedRole.tasks[1].name).toBe("review-change");

      // Apps
      expect(resolvedRole.apps).toHaveLength(2);
      expect(resolvedRole.apps[0].name).toBe("github");
      expect(resolvedRole.apps[0].transport).toBe("streamable-http");
      expect(resolvedRole.apps[1].name).toBe("slack");
      expect(resolvedRole.apps[1].command).toBe("node");

      // Skills
      expect(resolvedRole.skills).toHaveLength(2);
      expect(resolvedRole.skills[0].name).toBe("prd-writing");

      // Permissions
      expect(resolvedRole.permissions["github"]).toEqual({
        allow: ["create_issue", "list_repos"],
        deny: ["delete_repo"],
      });
      expect(resolvedRole.permissions["slack"]).toEqual({
        allow: ["send_message"],
        deny: [],
      });

      // Container
      expect(resolvedRole.aptPackages).toEqual(["jq", "curl"]);
      expect(resolvedRole.baseImage).toBe("node:22-slim");
      expect(resolvedRole.mounts).toEqual([
        { source: "./data", target: "/workspace/data", readonly: true },
      ]);

      // Constraints
      expect(resolvedRole.constraints).toEqual({
        maxConcurrentTasks: 3,
        requireApprovalFor: ["create_pr"],
      });
    });

    it("round-trips correctly for codex dialect", () => {
      const role = fullRole();
      const agent = adaptRoleToResolvedAgent(role, "codex");
      expect(agent.runtimes).toEqual(["codex"]);
      // All other fields should be identical
      expect(agent.roles[0].tasks).toHaveLength(2);
      expect(agent.roles[0].apps).toHaveLength(2);
    });

    it("round-trips correctly for aider dialect", () => {
      const role = fullRole();
      const agent = adaptRoleToResolvedAgent(role, "aider");
      expect(agent.runtimes).toEqual(["aider"]);
      expect(agent.roles[0].tasks).toHaveLength(2);
      expect(agent.roles[0].apps).toHaveLength(2);
    });
  });
});
