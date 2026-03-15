import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { claudeCodeMaterializer } from "@clawmasons/claude-code";
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
    artifacts: ["./SKILL.md", "./examples/", "./schemas/"],
    description: "Issue labeling taxonomy and heuristics",
  };
}

function makeTriageTask(): ResolvedTask {
  return {
    name: "@clawmasons/task-triage-issue",
    version: "0.3.1",
    taskType: "subagent",
    prompt: "./prompts/triage.md",
    timeout: "5m",
    approval: "auto",
    requiredApps: ["@clawmasons/app-github"],
    requiredSkills: ["@clawmasons/skill-labeling"],
    apps: [makeGithubApp()],
    skills: [makeLabelingSkill()],
    subTasks: [],
  };
}

function makeReviewTask(): ResolvedTask {
  return {
    name: "@clawmasons/task-review-pr",
    version: "1.0.0",
    taskType: "subagent",
    prompt: "./prompts/review.md",
    requiredApps: ["@clawmasons/app-github"],
    apps: [makeGithubApp()],
    skills: [],
    subTasks: [],
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
    runtimes: ["claude-code", "codex"],
    credentials: [],
    roles: [issueManager, prReviewer],
    proxy: {
      port: 9090,
      type: "sse",
    },
  };
}

describe("claudeCodeMaterializer", () => {
  it("has name 'claude-code'", () => {
    expect(claudeCodeMaterializer.name).toBe("claude-code");
  });

  describe("materializeWorkspace", () => {
    describe(".mcp.json", () => {
      it("generates single chapter entry with default SSE proxy", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const mcpJson = result.get(".mcp.json");
        expect(mcpJson).toBeDefined();

        const mcp = JSON.parse(mcpJson!);
        expect(mcp.mcpServers.chapter).toBeDefined();
        expect(mcp.mcpServers.chapter.type).toBe("sse");
        expect(mcp.mcpServers.chapter.url).toBe("http://mcp-proxy:9090/sse");
        expect(Object.keys(mcp.mcpServers)).toEqual(["chapter"]);
      });

      it("generates single chapter entry with custom port", () => {
        const agent = makeRepoOpsAgent();
        agent.proxy = { port: 8080, type: "sse" };
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:8080");

        const mcp = JSON.parse(result.get(".mcp.json")!);
        expect(mcp.mcpServers.chapter.url).toBe("http://mcp-proxy:8080/sse");
      });

      it("generates chapter entry with streamable-http transport", () => {
        const agent = makeRepoOpsAgent();
        agent.proxy = { port: 9090, type: "streamable-http" };
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const mcp = JSON.parse(result.get(".mcp.json")!);
        expect(mcp.mcpServers.chapter.type).toBe("streamable-http");
        expect(mcp.mcpServers.chapter.url).toBe("http://mcp-proxy:9090/mcp");
      });

      it("includes placeholder auth header when no token provided", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const mcp = JSON.parse(result.get(".mcp.json")!);
        expect(mcp.mcpServers.chapter.headers.Authorization).toBe("Bearer ${CHAPTER_PROXY_TOKEN}");
      });

      it("bakes actual token into auth header when proxyToken provided", () => {
        const agent = makeRepoOpsAgent();
        const token = "abc123def456";
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090", token);

        const mcp = JSON.parse(result.get(".mcp.json")!);
        expect(mcp.mcpServers.chapter.headers.Authorization).toBe("Bearer abc123def456");
      });

      it("does not contain permissions", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const mcp = JSON.parse(result.get(".mcp.json")!);
        expect(mcp.permissions).toBeUndefined();
      });

      it("defaults to SSE when agent has no proxy field", () => {
        const agent = makeRepoOpsAgent();
        delete agent.proxy;
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const mcp = JSON.parse(result.get(".mcp.json")!);
        expect(mcp.mcpServers.chapter.type).toBe("sse");
        expect(mcp.mcpServers.chapter.url).toBe("http://mcp-proxy:9090/sse");
      });
    });

    describe("settings.json", () => {
      it("includes single chapter permission", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const settings = JSON.parse(result.get(".claude/settings.json")!);
        expect(settings.permissions.allow).toEqual(["mcp__chapter__*"]);
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

        expect(result.has(".claude/commands/triage-issue.md")).toBe(true);
        expect(result.has(".claude/commands/review-pr.md")).toBe(true);
      });

      it("uses short name for command filename (strips scope and task- prefix)", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        // @clawmasons/task-triage-issue -> triage-issue.md
        expect(result.has(".claude/commands/triage-issue.md")).toBe(true);
      });

      it("includes role context with permitted tools", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const triageCmd = result.get(".claude/commands/triage-issue.md")!;
        expect(triageCmd).toContain("role: issue-manager");
        expect(triageCmd).toContain("github: create_issue, list_repos, add_label");
        expect(triageCmd).toContain("slack: send_message");
      });

      it("includes task header with package name and version", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const triageCmd = result.get(".claude/commands/triage-issue.md")!;
        expect(triageCmd).toContain("Generated by chapter from @clawmasons/task-triage-issue@0.3.1");
      });

      it("includes skill references when task has skills", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const triageCmd = result.get(".claude/commands/triage-issue.md")!;
        expect(triageCmd).toContain("Required Skills");
        expect(triageCmd).toContain("skills/labeling/");
      });

      it("omits skills section when task has no skills", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const reviewCmd = result.get(".claude/commands/review-pr.md")!;
        expect(reviewCmd).not.toContain("Required Skills");
      });

      it("includes prompt reference in Task section", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const triageCmd = result.get(".claude/commands/triage-issue.md")!;
        expect(triageCmd).toContain("## Task");
        expect(triageCmd).toContain("./prompts/triage.md");
      });

      it("warns when no prompt defined", () => {
        const agent = makeRepoOpsAgent();
        // Remove prompt from review task
        agent.roles[1].tasks[0].prompt = undefined;
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const reviewCmd = result.get(".claude/commands/review-pr.md")!;
        expect(reviewCmd).toContain("[no prompt defined]");
      });
    });

    describe("AGENTS.md", () => {
      it("generates AGENTS.md with agent short name", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const agentsMd = result.get("AGENTS.md")!;
        expect(agentsMd).toContain("# Agent: repo-ops");
      });

      it("includes chapter-managed preamble", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const agentsMd = result.get("AGENTS.md")!;
        expect(agentsMd).toContain("managed by chapter");
        expect(agentsMd).toContain("Only use tools permitted by the active role");
      });

      it("includes sections for all roles with descriptions", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const agentsMd = result.get("AGENTS.md")!;
        expect(agentsMd).toContain("### issue-manager");
        expect(agentsMd).toContain("Manages GitHub issues: triage, label, assign.");
        expect(agentsMd).toContain("### pr-reviewer");
        expect(agentsMd).toContain("Reviews pull requests and provides feedback.");
      });

      it("lists permitted tools per role per app", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const agentsMd = result.get("AGENTS.md")!;
        // issue-manager tools
        expect(agentsMd).toContain("github: create_issue, list_repos, add_label");
        expect(agentsMd).toContain("slack: send_message");
        // pr-reviewer tools
        expect(agentsMd).toContain("github: list_repos, get_pr, create_review");
      });

      it("includes constraints when present", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const agentsMd = result.get("AGENTS.md")!;
        expect(agentsMd).toContain("**Constraints:**");
        expect(agentsMd).toContain("Max concurrent tasks: 3");
        expect(agentsMd).toContain("Requires approval for: assign_issue");
      });

      it("omits constraints section when role has no constraints", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const agentsMd = result.get("AGENTS.md")!;
        // pr-reviewer has no constraints -- find the section after pr-reviewer
        const prReviewerIndex = agentsMd.indexOf("### pr-reviewer");
        const afterPrReviewer = agentsMd.slice(prReviewerIndex);
        expect(afterPrReviewer).not.toContain("**Constraints:**");
      });
    });

    describe("skills directory", () => {
      it("generates README.md for each unique skill", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        expect(result.has("skills/labeling/README.md")).toBe(true);
      });

      it("includes skill description in README", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const readme = result.get("skills/labeling/README.md")!;
        expect(readme).toContain("Issue labeling taxonomy and heuristics");
      });

      it("lists skill artifacts in README", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const readme = result.get("skills/labeling/README.md")!;
        expect(readme).toContain("./SKILL.md");
        expect(readme).toContain("./examples/");
        expect(readme).toContain("./schemas/");
      });

      it("deduplicates skills across roles", () => {
        const agent = makeRepoOpsAgent();
        // Add the same skill to pr-reviewer role too
        agent.roles[1].skills = [makeLabelingSkill()];

        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        // Should only have one skills/labeling/ entry
        const skillEntries = [...result.keys()].filter((k) => k.startsWith("skills/"));
        expect(skillEntries).toEqual(["skills/labeling/README.md"]);
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
    });

    describe("result completeness", () => {
      it("contains all expected files for repo-ops agent", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const keys = [...result.keys()].sort();
        expect(keys).toEqual([
          ".claude/commands/review-pr.md",
          ".claude/commands/triage-issue.md",
          ".claude/settings.json",
          ".mcp.json",
          "AGENTS.md",
          "agent-launch.json",
          "skills/labeling/README.md",
        ]);
      });
    });

    describe("ACP mode", () => {
      it("does not generate .chapter/acp.json when acpMode is false", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        expect(result.has(".chapter/acp.json")).toBe(false);
      });

      it("does not generate .chapter/acp.json when options is undefined", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090", undefined, undefined);

        expect(result.has(".chapter/acp.json")).toBe(false);
      });

      it("generates .chapter/acp.json when acpMode is true", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090", undefined, { acpMode: true });

        expect(result.has(".chapter/acp.json")).toBe(true);
        const acpConfig = JSON.parse(result.get(".chapter/acp.json")!);
        expect(acpConfig.command).toBe("claude-agent-acp");
        expect(acpConfig.port).toBeUndefined();
      });

      it("maps claude-code runtime to claude-agent-acp command", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090", undefined, { acpMode: true });

        const acpConfig = JSON.parse(result.get(".chapter/acp.json")!);
        expect(acpConfig.command).toBe("claude-agent-acp");
      });

      it("still generates all standard workspace files in ACP mode", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090", undefined, { acpMode: true });

        expect(result.has(".mcp.json")).toBe(true);
        expect(result.has(".claude/settings.json")).toBe(true);
        expect(result.has("AGENTS.md")).toBe(true);
        expect(result.has(".claude/commands/triage-issue.md")).toBe(true);
      });

      it("includes .chapter/acp.json and agent-launch.json in result completeness", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090", undefined, { acpMode: true });

        const keys = [...result.keys()].sort();
        expect(keys).toEqual([
          ".chapter/acp.json",
          ".claude/commands/review-pr.md",
          ".claude/commands/triage-issue.md",
          ".claude/settings.json",
          ".mcp.json",
          "AGENTS.md",
          "agent-launch.json",
          "skills/labeling/README.md",
        ]);
      });
    });
  });

  describe("materializeHome", () => {
    let tmpDir: string;
    let fakeHostHome: string;
    let homePath: string;
    const projectDir = "/Users/greff/Projects/clawmasons/chapter";

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
            "clawmasons/chapter": [projectDir, `${projectDir}/e2e`],
            "clawmasons/other": ["/Users/greff/Projects/clawmasons/other"],
            "clawmasons/multi": ["/some/path", projectDir],
          },
        }));

        runMaterializeHome();

        const result = JSON.parse(fs.readFileSync(path.join(homePath, ".claude.json"), "utf-8"));
        // Matching repos rewritten to container path
        expect(result.githubRepoPaths["clawmasons/chapter"]).toEqual(["/home/mason/workspace/project"]);
        // Repo with mixed paths kept (one path matched)
        expect(result.githubRepoPaths["clawmasons/multi"]).toEqual(["/home/mason/workspace/project"]);
        // Non-matching repo removed
        expect(result.githubRepoPaths["clawmasons/other"]).toBeUndefined();
      });
    });

    describe("projects directory path transformation", () => {
      const flattenedPath = "-Users-greff-Projects-clawmasons-chapter";

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
