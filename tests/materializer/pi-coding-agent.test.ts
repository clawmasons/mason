import { describe, expect, it } from "vitest";
import { piCodingAgentMaterializer } from "../../src/materializer/pi-coding-agent.js";
import { PROVIDER_ENV_VARS } from "../../src/materializer/common.js";
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

function makePiAgent(): ResolvedAgent {
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
    runtimes: ["pi-coding-agent"],
    roles: [issueManager, prReviewer],
    proxy: {
      port: 9090,
      type: "sse",
    },
    llm: {
      provider: "openrouter",
      model: "anthropic/claude-sonnet-4",
    },
  };
}

describe("piCodingAgentMaterializer", () => {
  it("has name 'pi-coding-agent'", () => {
    expect(piCodingAgentMaterializer.name).toBe("pi-coding-agent");
  });

  describe("materializeWorkspace", () => {
    describe("AGENTS.md", () => {
      it("generates AGENTS.md with agent short name", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const agentsMd = result.get("AGENTS.md")!;
        expect(agentsMd).toContain("# Agent: repo-ops");
      });

      it("includes chapter-managed preamble", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const agentsMd = result.get("AGENTS.md")!;
        expect(agentsMd).toContain("managed by chapter");
        expect(agentsMd).toContain("Only use tools permitted by the active role");
      });

      it("includes sections for all roles with descriptions", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const agentsMd = result.get("AGENTS.md")!;
        expect(agentsMd).toContain("### issue-manager");
        expect(agentsMd).toContain("Manages GitHub issues: triage, label, assign.");
        expect(agentsMd).toContain("### pr-reviewer");
      });

      it("lists permitted tools per role per app", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const agentsMd = result.get("AGENTS.md")!;
        expect(agentsMd).toContain("github: create_issue, list_repos, add_label");
        expect(agentsMd).toContain("slack: send_message");
        expect(agentsMd).toContain("github: list_repos, get_pr, create_review");
      });

      it("includes constraints when present", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const agentsMd = result.get("AGENTS.md")!;
        expect(agentsMd).toContain("**Constraints:**");
        expect(agentsMd).toContain("Max concurrent tasks: 3");
        expect(agentsMd).toContain("Requires approval for: assign_issue");
      });
    });

    describe(".pi/settings.json", () => {
      it("contains correct model ID from llm config", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const settings = JSON.parse(result.get(".pi/settings.json")!);
        expect(settings.model).toBe("openrouter/anthropic/claude-sonnet-4");
      });

      it("constructs model ID as provider/model", () => {
        const agent = makePiAgent();
        agent.llm = { provider: "anthropic", model: "claude-opus-4" };
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const settings = JSON.parse(result.get(".pi/settings.json")!);
        expect(settings.model).toBe("anthropic/claude-opus-4");
      });

      it("throws when agent.llm is undefined", () => {
        const agent = makePiAgent();
        delete agent.llm;

        expect(() => {
          piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");
        }).toThrow(/llm configuration/i);
      });
    });

    describe(".pi/extensions/chapter-mcp/package.json", () => {
      it("generates valid package.json with correct structure", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const pkg = JSON.parse(result.get(".pi/extensions/chapter-mcp/package.json")!);
        expect(pkg.name).toBe("chapter-mcp");
        expect(pkg.version).toBe("1.0.0");
        expect(pkg.type).toBe("module");
        expect(pkg.main).toBe("index.ts");
      });
    });

    describe(".pi/mcp.json", () => {
      it("contains chapter MCP server with proxy endpoint", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const mcpJson = JSON.parse(result.get(".pi/mcp.json")!);
        expect(mcpJson.mcpServers.chapter).toBeDefined();
        expect(mcpJson.mcpServers.chapter.url).toBe("http://mcp-proxy:9090/sse");
        expect(mcpJson.mcpServers.chapter.type).toBe("sse");
      });

      it("uses streamable-http path when proxy type is streamable-http", () => {
        const agent = makePiAgent();
        agent.proxy = { port: 9090, type: "streamable-http" };
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const mcpJson = JSON.parse(result.get(".pi/mcp.json")!);
        expect(mcpJson.mcpServers.chapter.url).toBe("http://mcp-proxy:9090/mcp");
        expect(mcpJson.mcpServers.chapter.type).toBe("streamable-http");
      });

      it("defaults to SSE when no proxy type specified", () => {
        const agent = makePiAgent();
        delete agent.proxy;
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const mcpJson = JSON.parse(result.get(".pi/mcp.json")!);
        expect(mcpJson.mcpServers.chapter.url).toBe("http://mcp-proxy:9090/sse");
        expect(mcpJson.mcpServers.chapter.type).toBe("sse");
      });

      it("includes placeholder auth header when no token provided", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const mcpJson = JSON.parse(result.get(".pi/mcp.json")!);
        expect(mcpJson.mcpServers.chapter.headers.Authorization).toBe("Bearer ${CHAPTER_PROXY_TOKEN}");
      });

      it("bakes actual token into auth header when proxyToken provided", () => {
        const agent = makePiAgent();
        const token = "abc123def456";
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090", token);

        const mcpJson = JSON.parse(result.get(".pi/mcp.json")!);
        expect(mcpJson.mcpServers.chapter.headers.Authorization).toBe("Bearer abc123def456");
      });
    });

    describe(".pi/extensions/chapter-mcp/index.ts", () => {
      it("does not contain registerMcpServer (MCP config is in .pi/mcp.json)", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const indexTs = result.get(".pi/extensions/chapter-mcp/index.ts")!;
        expect(indexTs).not.toContain("pi.registerMcpServer(");
      });

      it("includes registerCommand for each unique task", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const indexTs = result.get(".pi/extensions/chapter-mcp/index.ts")!;
        // Two tasks: triage-issue and review-pr
        const registerCommandCount = (indexTs.match(/pi\.registerCommand\(/g) || []).length;
        expect(registerCommandCount).toBe(2);
      });

      it("uses task short names for command names", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const indexTs = result.get(".pi/extensions/chapter-mcp/index.ts")!;
        expect(indexTs).toContain('name: "triage-issue"');
        expect(indexTs).toContain('name: "review-pr"');
      });

      it("includes role context in command prompt", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const indexTs = result.get(".pi/extensions/chapter-mcp/index.ts")!;
        expect(indexTs).toContain("role: issue-manager");
        expect(indexTs).toContain("github: create_issue, list_repos, add_label");
      });

      it("includes skill references in command prompt when task has skills", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const indexTs = result.get(".pi/extensions/chapter-mcp/index.ts")!;
        expect(indexTs).toContain("Required Skills");
        expect(indexTs).toContain("skills/labeling/");
      });

      it("omits skills section in command prompt when task has no skills", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const indexTs = result.get(".pi/extensions/chapter-mcp/index.ts")!;
        // Find the review-pr command block
        const reviewPrIndex = indexTs.indexOf('name: "review-pr"');
        const afterReviewPr = indexTs.slice(reviewPrIndex);
        // The review-pr task has no skills, so its prompt should not contain "Required Skills"
        // Extract just the prompt for review-pr (up to the closing });)
        const closingBrace = afterReviewPr.indexOf("});");
        const reviewPrBlock = afterReviewPr.slice(0, closingBrace);
        expect(reviewPrBlock).not.toContain("Required Skills");
      });

      it("includes task prompt reference in command prompt", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const indexTs = result.get(".pi/extensions/chapter-mcp/index.ts")!;
        expect(indexTs).toContain("## Task");
        expect(indexTs).toContain("./prompts/triage.md");
      });

      it("shows [no prompt defined] when task has no prompt", () => {
        const agent = makePiAgent();
        agent.roles[1].tasks[0].prompt = undefined;
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const indexTs = result.get(".pi/extensions/chapter-mcp/index.ts")!;
        expect(indexTs).toContain("[no prompt defined]");
      });

      it("is a valid-looking TypeScript module with default export", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const indexTs = result.get(".pi/extensions/chapter-mcp/index.ts")!;
        expect(indexTs).toContain("export default (pi) => {");
        expect(indexTs.trim().endsWith("};")).toBe(true);
      });
    });

    describe("skills directory", () => {
      it("generates README.md for each unique skill", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        expect(result.has("skills/labeling/README.md")).toBe(true);
      });

      it("includes skill description in README", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const readme = result.get("skills/labeling/README.md")!;
        expect(readme).toContain("Issue labeling taxonomy and heuristics");
      });

      it("lists skill artifacts in README", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const readme = result.get("skills/labeling/README.md")!;
        expect(readme).toContain("./SKILL.md");
        expect(readme).toContain("./examples/");
        expect(readme).toContain("./schemas/");
      });

      it("deduplicates skills across roles", () => {
        const agent = makePiAgent();
        agent.roles[1].skills = [makeLabelingSkill()];

        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const skillEntries = [...result.keys()].filter((k) => k.startsWith("skills/"));
        expect(skillEntries).toEqual(["skills/labeling/README.md"]);
      });
    });

    describe("result completeness", () => {
      it("contains all expected files for pi agent", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const keys = [...result.keys()].sort();
        expect(keys).toEqual([
          ".pi/extensions/chapter-mcp/index.ts",
          ".pi/extensions/chapter-mcp/package.json",
          ".pi/mcp.json",
          ".pi/settings.json",
          "AGENTS.md",
          "skills/labeling/README.md",
        ]);
      });
    });
  });

  describe("PROVIDER_ENV_VARS", () => {
    it("maps openrouter to OPENROUTER_API_KEY", () => {
      expect(PROVIDER_ENV_VARS["openrouter"]).toBe("OPENROUTER_API_KEY");
    });

    it("maps anthropic to ANTHROPIC_API_KEY", () => {
      expect(PROVIDER_ENV_VARS["anthropic"]).toBe("ANTHROPIC_API_KEY");
    });

    it("maps openai to OPENAI_API_KEY", () => {
      expect(PROVIDER_ENV_VARS["openai"]).toBe("OPENAI_API_KEY");
    });

    it("maps google to GEMINI_API_KEY", () => {
      expect(PROVIDER_ENV_VARS["google"]).toBe("GEMINI_API_KEY");
    });

    it("maps mistral to MISTRAL_API_KEY", () => {
      expect(PROVIDER_ENV_VARS["mistral"]).toBe("MISTRAL_API_KEY");
    });

    it("maps groq to GROQ_API_KEY", () => {
      expect(PROVIDER_ENV_VARS["groq"]).toBe("GROQ_API_KEY");
    });

    it("maps xai to XAI_API_KEY", () => {
      expect(PROVIDER_ENV_VARS["xai"]).toBe("XAI_API_KEY");
    });

    it("maps azure-openai to AZURE_OPENAI_API_KEY", () => {
      expect(PROVIDER_ENV_VARS["azure-openai"]).toBe("AZURE_OPENAI_API_KEY");
    });

    it("contains exactly 8 providers", () => {
      expect(Object.keys(PROVIDER_ENV_VARS)).toHaveLength(8);
    });
  });
});
