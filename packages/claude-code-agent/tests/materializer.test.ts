import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { claudeCodeMaterializer } from "@clawmasons/claude-code-agent";
import type { ResolvedAgent, ResolvedApp, ResolvedRole, ResolvedSkill, ResolvedTask } from "@clawmasons/shared";

function makeGithubApp(): ResolvedApp {
  return {
    name: "@clawmasons/app-github",
    version: "1.2.0",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_TOKEN}" },
    tools: ["create_issue", "list_repos", "create_pr", "get_pr", "create_review", "add_label", "delete_repo", "transfer_repo"],
    capabilities: ["resources", "tools"],
    credentials: [],
  };
}

function makeSlackApp(): ResolvedApp {
  return {
    name: "@clawmasons/app-slack",
    version: "1.0.0",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-slack"],
    env: { SLACK_BOT_TOKEN: "${SLACK_BOT_TOKEN}" },
    tools: ["send_message", "list_channels"],
    capabilities: ["tools"],
    credentials: [],
  };
}

function makeLabelingSkill(): ResolvedSkill {
  return {
    name: "@clawmasons/skill-labeling",
    version: "1.0.0",
    artifacts: ["SKILL.md", "examples/example1.md", "schemas/labels.json"],
    description: "Issue labeling taxonomy and heuristics",
    contentMap: new Map([
      ["SKILL.md", "# Labeling\n\nIssue labeling taxonomy and heuristics"],
      ["examples/example1.md", "Example content"],
      ["schemas/labels.json", '{"labels": []}'],
    ]),
  };
}

function makeTriageTask(): ResolvedTask {
  return {
    name: "@clawmasons/task-triage-issue",
    version: "0.3.1",
    prompt: "./prompts/triage.md",
    description: "Triage incoming issues",
  };
}

function makeReviewTask(): ResolvedTask {
  return {
    name: "@clawmasons/task-review-pr",
    version: "1.0.0",
    prompt: "./prompts/review.md",
    description: "Review pull requests",
  };
}

function makeRepoOpsAgent(): ResolvedAgent {
  const githubApp = makeGithubApp();
  const slackApp = makeSlackApp();
  const labelingSkill = makeLabelingSkill();

  const issueManager: ResolvedRole = {
    name: "@clawmasons/role-issue-manager",
    version: "2.0.0",
    description: "Manages GitHub issues: triage, label, assign.",
    risk: "LOW",
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
    tasks: [makeTriageTask()],
    apps: [githubApp, slackApp],
    skills: [labelingSkill],
  };

  const prReviewer: ResolvedRole = {
    name: "@clawmasons/role-pr-reviewer",
    version: "1.0.0",
    description: "Reviews pull requests and provides feedback.",
    risk: "LOW",
    permissions: {
      "@clawmasons/app-github": {
        allow: ["list_repos", "get_pr", "create_review"],
        deny: [],
      },
    },
    tasks: [makeReviewTask()],
    apps: [githubApp],
    skills: [],
  };

  return {
    name: "@clawmasons/agent-repo-ops",
    version: "1.0.0",
    agentName: "Repo Ops",
    slug: "repo-ops",
    description: "Repository operations agent for GitHub.",
    runtimes: ["claude-code-agent", "codex"],
    credentials: [],
    roles: [issueManager, prReviewer],
    proxy: {
      port: 9090,
      type: "sse",
    },
  };
}

describe("claudeCodeMaterializer", () => {
  it("has name 'claude-code-agent'", () => {
    expect(claudeCodeMaterializer.name).toBe("claude-code-agent");
  });

  describe("materializeWorkspace", () => {
    describe(".claude.json (MCP config)", () => {
      it("generates single mason entry with default SSE proxy", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const claudeJson = result.get(".claude.json");
        expect(claudeJson).toBeDefined();

        const parsed = JSON.parse(claudeJson!);
        expect(parsed.mcpServers.mason).toBeDefined();
        expect(parsed.mcpServers.mason.type).toBe("sse");
        expect(parsed.mcpServers.mason.url).toBe("http://mcp-proxy:9090/sse");
        expect(Object.keys(parsed.mcpServers)).toEqual(["mason"]);
      });

      it("generates single mason entry with custom port", () => {
        const agent = makeRepoOpsAgent();
        agent.proxy = { port: 8080, type: "sse" };
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:8080");

        const parsed = JSON.parse(result.get(".claude.json")!);
        expect(parsed.mcpServers.mason.url).toBe("http://mcp-proxy:8080/sse");
      });

      it('generates mason entry with http transport (streamable-http maps to "http" for Claude Code)', () => {
        const agent = makeRepoOpsAgent();
        agent.proxy = { port: 9090, type: "streamable-http" };
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const parsed = JSON.parse(result.get(".claude.json")!);
        expect(parsed.mcpServers.mason.type).toBe("http");
        expect(parsed.mcpServers.mason.url).toBe("http://mcp-proxy:9090/mcp");
      });

      it("includes placeholder auth header when no token provided", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const parsed = JSON.parse(result.get(".claude.json")!);
        expect(parsed.mcpServers.mason.headers.Authorization).toBe("Bearer ${MCP_PROXY_TOKEN}");
      });

      it("bakes actual token into auth header when proxyToken provided", () => {
        const agent = makeRepoOpsAgent();
        const token = "abc123def456";
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090", token);

        const parsed = JSON.parse(result.get(".claude.json")!);
        expect(parsed.mcpServers.mason.headers.Authorization).toBe("Bearer abc123def456");
      });

      it("defaults to SSE when agent has no proxy field", () => {
        const agent = makeRepoOpsAgent();
        delete agent.proxy;
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const parsed = JSON.parse(result.get(".claude.json")!);
        expect(parsed.mcpServers.mason.type).toBe("sse");
        expect(parsed.mcpServers.mason.url).toBe("http://mcp-proxy:9090/sse");
      });

      it("does not emit .mcp.json", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");
        expect(result.has(".mcp.json")).toBe(false);
      });
    });

    describe("settings.json", () => {
      it("includes single mason permission", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const settings = JSON.parse(result.get(".claude/settings.json")!);
        expect(settings.permissions.allow).toEqual(["mcp__mason__*"]);
        expect(settings.permissions.deny).toEqual([]);
      });

      it("does not contain mcpServers", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const settings = JSON.parse(result.get(".claude/settings.json")!);
        expect(settings.mcpServers).toBeUndefined();
      });
    });

    describe("slash commands", () => {
      it("generates one command file per unique task", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        expect(result.has(".claude/commands/@clawmasons/task-triage-issue.md")).toBe(true);
        expect(result.has(".claude/commands/@clawmasons/task-review-pr.md")).toBe(true);
      });

      it("includes task description in frontmatter", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const triageCmd = result.get(".claude/commands/@clawmasons/task-triage-issue.md")!;
        expect(triageCmd).toContain("Triage incoming issues");
      });

      it("includes prompt as markdown body", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const triageCmd = result.get(".claude/commands/@clawmasons/task-triage-issue.md")!;
        expect(triageCmd).toContain("./prompts/triage.md");
      });

      it("produces empty body when no prompt defined", () => {
        const agent = makeRepoOpsAgent();
        agent.roles[1].tasks[0].prompt = undefined;
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const reviewCmd = result.get(".claude/commands/@clawmasons/task-review-pr.md")!;
        // Body should be empty (no prompt), but frontmatter may still be present
        expect(reviewCmd).not.toContain("./prompts/");
      });
    });


    describe("skills directory", () => {
      it("materializes SKILL.md and companion files under .claude/skills/", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        expect(result.has(".claude/skills/labeling/SKILL.md")).toBe(true);
        expect(result.has(".claude/skills/labeling/examples/example1.md")).toBe(true);
        expect(result.has(".claude/skills/labeling/schemas/labels.json")).toBe(true);
      });

      it("includes actual skill content in materialized files", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const skillMd = result.get(".claude/skills/labeling/SKILL.md")!;
        expect(skillMd).toContain("Issue labeling taxonomy and heuristics");
      });

      it("copies companion file content verbatim", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        expect(result.get(".claude/skills/labeling/examples/example1.md")).toBe("Example content");
        expect(result.get(".claude/skills/labeling/schemas/labels.json")).toBe('{"labels": []}');
      });

      it("deduplicates skills across roles", () => {
        const agent = makeRepoOpsAgent();
        // Add the same skill to pr-reviewer role too
        agent.roles[1].skills = [makeLabelingSkill()];

        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        // Should only have one set of .claude/skills/labeling/ entries
        const skillEntries = [...result.keys()].filter((k) => k.startsWith(".claude/skills/labeling/"));
        expect(skillEntries).toHaveLength(3); // SKILL.md + 2 companions
      });
    });

    describe("agent-launch.json", () => {
      it("generates agent-launch.json with claude command", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const launchJson = result.get("agent-launch.json");
        expect(launchJson).toBeDefined();

        const config = JSON.parse(launchJson!);
        expect(config.command).toBe("claude");
        expect(config.credentials).toBeDefined();
      });

      it("includes CLAUDE_CODE_OAUTH_TOKEN as env credential", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const config = JSON.parse(result.get("agent-launch.json")!);
        const claudeCred = config.credentials.find(
          (c: { key: string }) => c.key === "CLAUDE_CODE_OAUTH_TOKEN",
        );
        expect(claudeCred).toBeDefined();
        expect(claudeCred.type).toBe("env");
      });

      it("includes role-declared credentials as env type", () => {
        const agent = makeRepoOpsAgent();
        agent.credentials = ["GITHUB_TOKEN", "SLACK_TOKEN"];
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const config = JSON.parse(result.get("agent-launch.json")!);
        const ghCred = config.credentials.find(
          (c: { key: string }) => c.key === "GITHUB_TOKEN",
        );
        expect(ghCred).toBeDefined();
        expect(ghCred.type).toBe("env");
      });

      it("uses ACP command when acpMode is true", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(
          agent, "http://mcp-proxy:9090", undefined, { acpMode: true },
        );

        const config = JSON.parse(result.get("agent-launch.json")!);
        expect(config.command).toBe("claude-agent-acp");
      });

      it("appends initialPrompt as final positional in args", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(
          agent, "http://mcp-proxy:9090", undefined, { initialPrompt: "do this task" },
        );

        const config = JSON.parse(result.get("agent-launch.json")!);
        expect(config.args).toBeDefined();
        expect(config.args[config.args.length - 1]).toBe("do this task");
      });

      it("places initialPrompt after --append-system-prompt when instructions present", () => {
        const agent = makeRepoOpsAgent();
        agent.roles[0].instructions = "You are a focused reviewer.";
        const result = claudeCodeMaterializer.materializeWorkspace(
          agent, "http://mcp-proxy:9090", undefined, { initialPrompt: "start now" },
        );

        const config = JSON.parse(result.get("agent-launch.json")!);
        const appendIdx = config.args.indexOf("--append-system-prompt");
        const promptIdx = config.args.indexOf("start now");
        expect(appendIdx).toBeGreaterThanOrEqual(0);
        expect(promptIdx).toBeGreaterThan(appendIdx + 1);
        expect(config.args[config.args.length - 1]).toBe("start now");
      });

      it("omits initialPrompt from args when not provided", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const config = JSON.parse(result.get("agent-launch.json")!);
        // Only --effort max by default, no extra positional
        expect(config.args).toEqual(["--effort", "max"]);
      });
    });

    describe("result completeness", () => {
      it("contains all expected files for repo-ops agent", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const keys = [...result.keys()].sort();
        expect(keys).toEqual([
          ".claude.json",
          ".claude/commands/@clawmasons/task-review-pr.md",
          ".claude/commands/@clawmasons/task-triage-issue.md",
          ".claude/settings.json",
          ".claude/skills/labeling/SKILL.md",
          ".claude/skills/labeling/examples/example1.md",
          ".claude/skills/labeling/schemas/labels.json",
          "agent-launch.json",
        ]);
      });
    });

    describe("ACP mode", () => {
      it("does not generate .mason/acp.json even in ACP mode", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090", undefined, { acpMode: true });

        expect(result.has(".mason/acp.json")).toBe(false);
      });

      it("still generates all standard workspace files in ACP mode", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090", undefined, { acpMode: true });

        expect(result.has(".claude.json")).toBe(true);
        expect(result.has(".claude/settings.json")).toBe(true);
        expect(result.has(".claude/commands/@clawmasons/task-triage-issue.md")).toBe(true);
      });
    });
  });

  describe("materializeSupervisor", () => {
    it("emits .claude.json with mcpServers (no existingHomePath)", () => {
      const agent = makeRepoOpsAgent();
      const result = claudeCodeMaterializer.materializeSupervisor!(agent, "http://mcp-proxy:9090");

      const claudeJsonStr = result.get(".claude.json");
      expect(claudeJsonStr).toBeDefined();
      const claudeJson = JSON.parse(claudeJsonStr!);
      expect(claudeJson.mcpServers).toBeDefined();
      expect(claudeJson.mcpServers.mason).toBeDefined();
    });

    it("does not emit .mcp.json", () => {
      const agent = makeRepoOpsAgent();
      const result = claudeCodeMaterializer.materializeSupervisor!(agent, "http://mcp-proxy:9090");

      expect(result.has(".mcp.json")).toBe(false);
    });

    it("emits skills under .claude/skills/{name}/ with actual content", () => {
      const agent = makeRepoOpsAgent();
      const result = claudeCodeMaterializer.materializeSupervisor!(agent, "http://mcp-proxy:9090");

      expect(result.has(".claude/skills/labeling/SKILL.md")).toBe(true);
      expect(result.has(".claude/skills/labeling/examples/example1.md")).toBe(true);
      expect(result.has("skills/labeling/SKILL.md")).toBe(false);
    });

    it("emits .claude/commands/ and .claude/settings.json", () => {
      const agent = makeRepoOpsAgent();
      const result = claudeCodeMaterializer.materializeSupervisor!(agent, "http://mcp-proxy:9090");

      expect(result.has(".claude/settings.json")).toBe(true);
      expect(result.has(".claude/commands/@clawmasons/task-triage-issue.md")).toBe(true);
      expect(result.has(".claude/commands/@clawmasons/task-review-pr.md")).toBe(true);
    });

    it("emits agent-launch.json", () => {
      const agent = makeRepoOpsAgent();
      const result = claudeCodeMaterializer.materializeSupervisor!(agent, "http://mcp-proxy:9090");

      expect(result.has("agent-launch.json")).toBe(true);
      expect(result.has("AGENTS.md")).toBe(false);
    });

    it("appends initialPrompt as final positional in supervisor agent-launch.json", () => {
      const agent = makeRepoOpsAgent();
      const result = claudeCodeMaterializer.materializeSupervisor!(
        agent, "http://mcp-proxy:9090", undefined, { initialPrompt: "supervise this" },
      );

      const config = JSON.parse(result.get("agent-launch.json")!);
      expect(config.args[config.args.length - 1]).toBe("supervise this");
    });

    it("omits initialPrompt from supervisor agent-launch.json when not provided", () => {
      const agent = makeRepoOpsAgent();
      const result = claudeCodeMaterializer.materializeSupervisor!(agent, "http://mcp-proxy:9090");

      const config = JSON.parse(result.get("agent-launch.json")!);
      expect(config.args).toEqual(["--effort", "max"]);
    });

    it("merges mcpServers into existing .claude.json when existingHomePath provided", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "supervisor-test-"));
      try {
        const existingClaudeJson = {
          hasCompletedOnboarding: true,
          mcpServers: { existing: { type: "sse", url: "http://existing:9090/sse" } },
        };
        fs.writeFileSync(path.join(tmpDir, ".claude.json"), JSON.stringify(existingClaudeJson));

        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeSupervisor!(
          agent, "http://mcp-proxy:9090", undefined, undefined, tmpDir,
        );

        const claudeJson = JSON.parse(result.get(".claude.json")!);
        // Existing top-level fields preserved
        expect(claudeJson.hasCompletedOnboarding).toBe(true);
        // Existing mcpServers preserved, new mason entry added
        expect(claudeJson.mcpServers.existing).toBeDefined();
        expect(claudeJson.mcpServers.mason).toBeDefined();
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("emits complete set of expected files", () => {
      const agent = makeRepoOpsAgent();
      const result = claudeCodeMaterializer.materializeSupervisor!(agent, "http://mcp-proxy:9090");

      const keys = [...result.keys()].sort();
      expect(keys).toEqual([
        ".claude.json",
        ".claude/commands/@clawmasons/task-review-pr.md",
        ".claude/commands/@clawmasons/task-triage-issue.md",
        ".claude/settings.json",
        ".claude/skills/labeling/SKILL.md",
        ".claude/skills/labeling/examples/example1.md",
        ".claude/skills/labeling/schemas/labels.json",
        "agent-launch.json",
      ]);
    });
  });

  describe("materializeHome", () => {
    let tmpDir: string;
    let fakeHostHome: string;
    let homePath: string;
    const projectDir = "/Users/greff/Projects/clawmasons/mason";

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "materialize-home-test-"));
      fakeHostHome = path.join(tmpDir, "host-home");
      homePath = path.join(tmpDir, "agent-home");

      // Create fake host home with .claude directory
      fs.mkdirSync(path.join(fakeHostHome, ".claude"), { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    /**
     * Helper: run materializeHome with a fake HOME override.
     * We temporarily override os.homedir() by setting HOME env var.
     */
    function runMaterializeHome(projDir?: string): void {
      const originalHome = process.env.HOME;
      try {
        process.env.HOME = fakeHostHome;
        claudeCodeMaterializer.materializeHome!(projDir ?? projectDir, homePath);
      } finally {
        process.env.HOME = originalHome;
      }
    }

    it("copies all claude config directories when they exist", () => {
      // Create source dirs and files
      fs.mkdirSync(path.join(fakeHostHome, ".claude", "statsig"), { recursive: true });
      fs.writeFileSync(path.join(fakeHostHome, ".claude", "statsig", "data.json"), '{"flags": true}');
      fs.mkdirSync(path.join(fakeHostHome, ".claude", "plans"), { recursive: true });
      fs.writeFileSync(path.join(fakeHostHome, ".claude", "plans", "plan1.md"), "# Plan 1");
      fs.mkdirSync(path.join(fakeHostHome, ".claude", "plugins"), { recursive: true });
      fs.writeFileSync(path.join(fakeHostHome, ".claude", "plugins", "plugin.js"), "module.exports = {}");
      fs.mkdirSync(path.join(fakeHostHome, ".claude", "skills"), { recursive: true });
      fs.writeFileSync(path.join(fakeHostHome, ".claude", "skills", "skill.md"), "# Skill");

      runMaterializeHome();

      expect(fs.existsSync(path.join(homePath, ".claude", "statsig", "data.json"))).toBe(true);
      expect(fs.existsSync(path.join(homePath, ".claude", "plans", "plan1.md"))).toBe(true);
      expect(fs.existsSync(path.join(homePath, ".claude", "plugins", "plugin.js"))).toBe(true);
      expect(fs.existsSync(path.join(homePath, ".claude", "skills", "skill.md"))).toBe(true);
    });

    it("copies individual config files", () => {
      fs.writeFileSync(path.join(fakeHostHome, ".claude", "settings.json"), '{"theme":"dark"}');
      fs.writeFileSync(path.join(fakeHostHome, ".claude", "stats-cache.json"), '{"stats":1}');
      fs.writeFileSync(path.join(fakeHostHome, ".claude.json"), '{"version":1}');

      runMaterializeHome();

      expect(fs.readFileSync(path.join(homePath, ".claude", "settings.json"), "utf-8")).toBe('{"theme":"dark"}');
      expect(fs.readFileSync(path.join(homePath, ".claude", "stats-cache.json"), "utf-8")).toBe('{"stats":1}');
      // .claude.json is transformed (project paths remapped, onboarding flags set)
      const claudeJson = JSON.parse(fs.readFileSync(path.join(homePath, ".claude.json"), "utf-8"));
      expect(claudeJson.version).toBe(1);
      expect(claudeJson.hasCompletedOnboarding).toBe(true);
    });

    it("silently skips missing source paths", () => {
      // Don't create any source files — should not throw
      runMaterializeHome();

      // homePath should still be created
      expect(fs.existsSync(path.join(homePath, ".claude"))).toBe(true);
    });

    it("creates homePath if it does not exist", () => {
      expect(fs.existsSync(homePath)).toBe(false);

      runMaterializeHome();

      expect(fs.existsSync(homePath)).toBe(true);
    });

    describe(".claude.json transformation", () => {
      it("remaps project entry to container path and sets trust flags", () => {
        fs.writeFileSync(path.join(fakeHostHome, ".claude.json"), JSON.stringify({
          numStartups: 10,
          projects: {
            [projectDir]: { allowedTools: ["Bash"], hasTrustDialogAccepted: false },
            "/some/other/project": { allowedTools: [] },
          },
        }));

        runMaterializeHome();

        const result = JSON.parse(fs.readFileSync(path.join(homePath, ".claude.json"), "utf-8"));
        // Only the container path entry should remain
        expect(Object.keys(result.projects)).toEqual(["/home/mason/workspace/project"]);
        // Trust and onboarding flags must be set
        expect(result.projects["/home/mason/workspace/project"].hasTrustDialogAccepted).toBe(true);
        expect(result.projects["/home/mason/workspace/project"].hasCompletedProjectOnboarding).toBe(true);
        // Original settings preserved
        expect(result.projects["/home/mason/workspace/project"].allowedTools).toEqual(["Bash"]);
        // Top-level onboarding and prompt suppression
        expect(result.hasCompletedOnboarding).toBe(true);
        expect(result.effortCalloutDismissed).toBe(true);
        // Other top-level fields preserved
        expect(result.numStartups).toBe(10);
      });

      it("creates project entry when source has no matching project", () => {
        fs.writeFileSync(path.join(fakeHostHome, ".claude.json"), JSON.stringify({
          numStartups: 5,
          projects: {},
        }));

        runMaterializeHome();

        const result = JSON.parse(fs.readFileSync(path.join(homePath, ".claude.json"), "utf-8"));
        expect(result.projects["/home/mason/workspace/project"].hasTrustDialogAccepted).toBe(true);
        expect(result.projects["/home/mason/workspace/project"].hasCompletedProjectOnboarding).toBe(true);
      });

      it("handles missing .claude.json gracefully", () => {
        // No .claude.json on host — should not throw
        runMaterializeHome();
        expect(fs.existsSync(path.join(homePath, ".claude.json"))).toBe(false);
      });

      it("filters and rewrites githubRepoPaths to container path", () => {
        fs.writeFileSync(path.join(fakeHostHome, ".claude.json"), JSON.stringify({
          githubRepoPaths: {
            "clawmasons/mason": [projectDir, `${projectDir}/e2e`],
            "clawmasons/other": ["/Users/greff/Projects/clawmasons/other"],
            "clawmasons/multi": ["/some/path", projectDir],
          },
        }));

        runMaterializeHome();

        const result = JSON.parse(fs.readFileSync(path.join(homePath, ".claude.json"), "utf-8"));
        // Matching repos rewritten to container path
        expect(result.githubRepoPaths["clawmasons/mason"]).toEqual(["/home/mason/workspace/project"]);
        // Repo with mixed paths kept (one path matched)
        expect(result.githubRepoPaths["clawmasons/multi"]).toEqual(["/home/mason/workspace/project"]);
        // Non-matching repo removed
        expect(result.githubRepoPaths["clawmasons/other"]).toBeUndefined();
      });
    });

    describe("projects directory path transformation", () => {
      const flattenedPath = "-Users-greff-Projects-clawmasons-mason";

      beforeEach(() => {
        // Create projects dir with multiple project subdirs
        const projectsDir = path.join(fakeHostHome, ".claude", "projects");
        fs.mkdirSync(path.join(projectsDir, flattenedPath), { recursive: true });
        fs.writeFileSync(path.join(projectsDir, flattenedPath, "context.md"), "# Project context");
        fs.mkdirSync(path.join(projectsDir, "-Users-greff-Projects-other-project"), { recursive: true });
        fs.writeFileSync(path.join(projectsDir, "-Users-greff-Projects-other-project", "other.md"), "# Other");
        fs.mkdirSync(path.join(projectsDir, "-Users-greff-Projects-third"), { recursive: true });
      });

      it("keeps only the matching project directory and renames it", () => {
        runMaterializeHome();

        const targetProjects = path.join(homePath, ".claude", "projects");
        const entries = fs.readdirSync(targetProjects);

        expect(entries).toEqual(["-home-mason-workspace-project"]);
        expect(
          fs.readFileSync(path.join(targetProjects, "-home-mason-workspace-project", "context.md"), "utf-8"),
        ).toBe("# Project context");
      });

      it("deletes non-matching project directories", () => {
        runMaterializeHome();

        const targetProjects = path.join(homePath, ".claude", "projects");
        expect(fs.existsSync(path.join(targetProjects, "-Users-greff-Projects-other-project"))).toBe(false);
        expect(fs.existsSync(path.join(targetProjects, "-Users-greff-Projects-third"))).toBe(false);
      });

      it("creates empty dir when no matching project found", () => {
        runMaterializeHome("/some/other/path");

        const targetProjects = path.join(homePath, ".claude", "projects");
        const entries = fs.readdirSync(targetProjects);
        expect(entries).toEqual(["-home-mason-workspace-project"]);

        // Should be empty
        const innerEntries = fs.readdirSync(path.join(targetProjects, "-home-mason-workspace-project"));
        expect(innerEntries).toEqual([]);
      });
    });
  });
});
