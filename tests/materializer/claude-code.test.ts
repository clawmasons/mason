import { describe, expect, it } from "vitest";
import { claudeCodeMaterializer } from "../../src/materializer/claude-code.js";
import type { ResolvedAgent, ResolvedApp, ResolvedRole, ResolvedSkill, ResolvedTask } from "../../src/resolver/types.js";

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
          "skills/labeling/README.md",
        ]);
      });
    });
  });
});
