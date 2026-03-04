import { describe, expect, it } from "vitest";
import { claudeCodeMaterializer } from "../../src/materializer/claude-code.js";
import type { ResolvedAgent, ResolvedApp, ResolvedRole, ResolvedSkill, ResolvedTask } from "../../src/resolver/types.js";

function makeGithubApp(): ResolvedApp {
  return {
    name: "@clawforge/app-github",
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
    name: "@clawforge/app-slack",
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
    name: "@clawforge/skill-labeling",
    version: "1.0.0",
    artifacts: ["./SKILL.md", "./examples/", "./schemas/"],
    description: "Issue labeling taxonomy and heuristics",
  };
}

function makeTriageTask(): ResolvedTask {
  return {
    name: "@clawforge/task-triage-issue",
    version: "0.3.1",
    taskType: "subagent",
    prompt: "./prompts/triage.md",
    timeout: "5m",
    approval: "auto",
    requiredApps: ["@clawforge/app-github"],
    requiredSkills: ["@clawforge/skill-labeling"],
    apps: [makeGithubApp()],
    skills: [makeLabelingSkill()],
    subTasks: [],
  };
}

function makeReviewTask(): ResolvedTask {
  return {
    name: "@clawforge/task-review-pr",
    version: "1.0.0",
    taskType: "subagent",
    prompt: "./prompts/review.md",
    requiredApps: ["@clawforge/app-github"],
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
    name: "@clawforge/role-issue-manager",
    version: "2.0.0",
    description: "Manages GitHub issues: triage, label, assign.",
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
    constraints: {
      maxConcurrentTasks: 3,
      requireApprovalFor: ["assign_issue"],
    },
    tasks: [makeTriageTask()],
    apps: [githubApp, slackApp],
    skills: [labelingSkill],
  };

  const prReviewer: ResolvedRole = {
    name: "@clawforge/role-pr-reviewer",
    version: "1.0.0",
    description: "Reviews pull requests and provides feedback.",
    permissions: {
      "@clawforge/app-github": {
        allow: ["list_repos", "get_pr", "create_review"],
        deny: [],
      },
    },
    tasks: [makeReviewTask()],
    apps: [githubApp],
    skills: [],
  };

  return {
    name: "@clawforge/agent-repo-ops",
    version: "1.0.0",
    description: "Repository operations agent for GitHub.",
    runtimes: ["claude-code", "codex"],
    roles: [issueManager, prReviewer],
    proxy: {
      image: "ghcr.io/tbxark/mcp-proxy:latest",
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
    describe("settings.json", () => {
      it("generates settings with default SSE proxy", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const settingsJson = result.get(".claude/settings.json");
        expect(settingsJson).toBeDefined();

        const settings = JSON.parse(settingsJson!);
        expect(settings.mcpServers["pam-proxy"].type).toBe("sse");
        expect(settings.mcpServers["pam-proxy"].url).toBe("http://mcp-proxy:9090/sse");
      });

      it("generates settings with custom port", () => {
        const agent = makeRepoOpsAgent();
        agent.proxy = { port: 8080, type: "sse" };
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:8080");

        const settings = JSON.parse(result.get(".claude/settings.json")!);
        expect(settings.mcpServers["pam-proxy"].url).toBe("http://mcp-proxy:8080/sse");
      });

      it("generates settings with streamable-http transport", () => {
        const agent = makeRepoOpsAgent();
        agent.proxy = { port: 9090, type: "streamable-http" };
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const settings = JSON.parse(result.get(".claude/settings.json")!);
        expect(settings.mcpServers["pam-proxy"].type).toBe("streamable-http");
        expect(settings.mcpServers["pam-proxy"].url).toBe("http://mcp-proxy:9090/mcp");
      });

      it("includes placeholder auth header when no token provided", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const settings = JSON.parse(result.get(".claude/settings.json")!);
        expect(settings.mcpServers["pam-proxy"].headers.Authorization).toBe("Bearer ${PAM_PROXY_TOKEN}");
      });

      it("bakes actual token into auth header when proxyToken provided", () => {
        const agent = makeRepoOpsAgent();
        const token = "abc123def456";
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090", token);

        const settings = JSON.parse(result.get(".claude/settings.json")!);
        expect(settings.mcpServers["pam-proxy"].headers.Authorization).toBe("Bearer abc123def456");
      });

      it("includes permissions allowing all proxy tools", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const settings = JSON.parse(result.get(".claude/settings.json")!);
        expect(settings.permissions.allow).toEqual(["mcp__pam-proxy__*"]);
        expect(settings.permissions.deny).toEqual([]);
      });

      it("defaults to SSE when agent has no proxy field", () => {
        const agent = makeRepoOpsAgent();
        delete agent.proxy;
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const settings = JSON.parse(result.get(".claude/settings.json")!);
        expect(settings.mcpServers["pam-proxy"].type).toBe("sse");
        expect(settings.mcpServers["pam-proxy"].url).toBe("http://mcp-proxy:9090/sse");
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

        // @clawforge/task-triage-issue → triage-issue.md
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
        expect(triageCmd).toContain("Generated by pam from @clawforge/task-triage-issue@0.3.1");
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

      it("includes pam-managed preamble", () => {
        const agent = makeRepoOpsAgent();
        const result = claudeCodeMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const agentsMd = result.get("AGENTS.md")!;
        expect(agentsMd).toContain("managed by pam");
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
        // pr-reviewer has no constraints — find the section after pr-reviewer
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
          "AGENTS.md",
          "skills/labeling/README.md",
        ]);
      });
    });
  });

  describe("generateDockerfile", () => {
    it("uses Node.js base image", () => {
      const agent = makeRepoOpsAgent();
      const dockerfile = claudeCodeMaterializer.generateDockerfile(agent);
      expect(dockerfile).toContain("FROM node:");
    });

    it("installs claude-code CLI", () => {
      const agent = makeRepoOpsAgent();
      const dockerfile = claudeCodeMaterializer.generateDockerfile(agent);
      expect(dockerfile).toContain("npm install -g @anthropic-ai/claude-code");
    });

    it("sets workspace as working directory", () => {
      const agent = makeRepoOpsAgent();
      const dockerfile = claudeCodeMaterializer.generateDockerfile(agent);
      expect(dockerfile).toContain("WORKDIR /workspace");
    });

    it("copies workspace directory", () => {
      const agent = makeRepoOpsAgent();
      const dockerfile = claudeCodeMaterializer.generateDockerfile(agent);
      expect(dockerfile).toContain("COPY workspace/ /workspace/");
    });

    it("skips OOBE setup wizard", () => {
      const agent = makeRepoOpsAgent();
      const dockerfile = claudeCodeMaterializer.generateDockerfile(agent);
      expect(dockerfile).toContain("hasCompletedOnboarding");
      expect(dockerfile).toContain("/root/.claude.json");
    });

    it("disables auto-updater", () => {
      const agent = makeRepoOpsAgent();
      const dockerfile = claudeCodeMaterializer.generateDockerfile(agent);
      expect(dockerfile).toContain("DISABLE_AUTOUPDATER=1");
    });
  });

  describe("generateComposeService", () => {
    it("builds from ./claude-code directory", () => {
      const agent = makeRepoOpsAgent();
      const service = claudeCodeMaterializer.generateComposeService(agent);
      expect(service.build).toBe("./claude-code");
    });

    it("depends on mcp-proxy", () => {
      const agent = makeRepoOpsAgent();
      const service = claudeCodeMaterializer.generateComposeService(agent);
      expect(service.depends_on).toContain("mcp-proxy");
    });

    it("mounts workspace volume", () => {
      const agent = makeRepoOpsAgent();
      const service = claudeCodeMaterializer.generateComposeService(agent);
      expect(service.volumes).toContain("./claude-code/workspace:/workspace");
    });

    it("includes PAM_ROLES with all role short names", () => {
      const agent = makeRepoOpsAgent();
      const service = claudeCodeMaterializer.generateComposeService(agent);
      expect(service.environment).toContain("PAM_ROLES=issue-manager,pr-reviewer");
    });

    it("includes ANTHROPIC_API_KEY env var", () => {
      const agent = makeRepoOpsAgent();
      const service = claudeCodeMaterializer.generateComposeService(agent);
      expect(service.environment).toContain("ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}");
    });

    it("enables interactive mode", () => {
      const agent = makeRepoOpsAgent();
      const service = claudeCodeMaterializer.generateComposeService(agent);
      expect(service.stdin_open).toBe(true);
      expect(service.tty).toBe(true);
    });

    it("connects to agent-net network", () => {
      const agent = makeRepoOpsAgent();
      const service = claudeCodeMaterializer.generateComposeService(agent);
      expect(service.networks).toContain("agent-net");
    });

    it("uses no restart policy for interactive containers", () => {
      const agent = makeRepoOpsAgent();
      const service = claudeCodeMaterializer.generateComposeService(agent);
      expect(service.restart).toBe("no");
    });

    it("sets /workspace as working directory", () => {
      const agent = makeRepoOpsAgent();
      const service = claudeCodeMaterializer.generateComposeService(agent);
      expect(service.working_dir).toBe("/workspace");
    });
  });
});
