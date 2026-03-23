import { describe, expect, it } from "vitest";
import { piCodingAgentMaterializer } from "@clawmasons/pi-coding-agent";
import { PROVIDER_ENV_VARS } from "@clawmasons/agent-sdk";
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
    location: "proxy",
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
    location: "proxy",
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

function makePiAgent(): ResolvedAgent {
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
    runtimes: ["pi-coding-agent"],
    credentials: [],
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

    describe(".pi/extensions/mason-mcp/package.json", () => {
      it("generates valid package.json with correct structure", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const pkg = JSON.parse(result.get(".pi/extensions/mason-mcp/package.json")!);
        expect(pkg.name).toBe("mason-mcp");
        expect(pkg.version).toBe("1.0.0");
        expect(pkg.type).toBe("module");
        expect(pkg.main).toBe("index.ts");
      });
    });

    describe(".pi/mcp.json", () => {
      it("contains mason MCP server with proxy endpoint", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const mcpJson = JSON.parse(result.get(".pi/mcp.json")!);
        expect(mcpJson.mcpServers.mason).toBeDefined();
        expect(mcpJson.mcpServers.mason.url).toBe("http://mcp-proxy:9090/sse");
        expect(mcpJson.mcpServers.mason.type).toBe("sse");
      });

      it("uses streamable-http path when proxy type is streamable-http", () => {
        const agent = makePiAgent();
        agent.proxy = { port: 9090, type: "streamable-http" };
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const mcpJson = JSON.parse(result.get(".pi/mcp.json")!);
        expect(mcpJson.mcpServers.mason.url).toBe("http://mcp-proxy:9090/mcp");
        expect(mcpJson.mcpServers.mason.type).toBe("streamable-http");
      });

      it("defaults to SSE when no proxy type specified", () => {
        const agent = makePiAgent();
        delete agent.proxy;
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const mcpJson = JSON.parse(result.get(".pi/mcp.json")!);
        expect(mcpJson.mcpServers.mason.url).toBe("http://mcp-proxy:9090/sse");
        expect(mcpJson.mcpServers.mason.type).toBe("sse");
      });

      it("includes placeholder auth header when no token provided", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const mcpJson = JSON.parse(result.get(".pi/mcp.json")!);
        expect(mcpJson.mcpServers.mason.headers.Authorization).toBe("Bearer ${MCP_PROXY_TOKEN}");
      });

      it("bakes actual token into auth header when proxyToken provided", () => {
        const agent = makePiAgent();
        const token = "abc123def456";
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090", token);

        const mcpJson = JSON.parse(result.get(".pi/mcp.json")!);
        expect(mcpJson.mcpServers.mason.headers.Authorization).toBe("Bearer abc123def456");
      });
    });

    describe(".pi/extensions/mason-mcp/index.ts", () => {
      it("does not contain registerMcpServer (MCP config is in .pi/mcp.json)", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const indexTs = result.get(".pi/extensions/mason-mcp/index.ts")!;
        expect(indexTs).not.toContain("pi.registerMcpServer(");
      });

      it("includes registerCommand for each unique task", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const indexTs = result.get(".pi/extensions/mason-mcp/index.ts")!;
        // Two tasks: triage-issue and review-pr
        const registerCommandCount = (indexTs.match(/pi\.registerCommand\(/g) || []).length;
        expect(registerCommandCount).toBe(2);
      });

      it("uses task short names for command names", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const indexTs = result.get(".pi/extensions/mason-mcp/index.ts")!;
        expect(indexTs).toContain('registerCommand("triage-issue"');
        expect(indexTs).toContain('registerCommand("review-pr"');
      });

      it("prefixes command name with scope when task has a scope", () => {
        const agent = makePiAgent();
        // Add scope to the triage task
        agent.roles[0].tasks[0] = { ...agent.roles[0].tasks[0], scope: "opsx" };
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const indexTs = result.get(".pi/extensions/mason-mcp/index.ts")!;
        expect(indexTs).toContain('registerCommand("opsx-triage-issue"');
        // review-pr has no scope, should remain unprefixed
        expect(indexTs).toContain('registerCommand("review-pr"');
      });

      it("includes task description in command", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const indexTs = result.get(".pi/extensions/mason-mcp/index.ts")!;
        expect(indexTs).toContain("@clawmasons/task-triage-issue@0.3.1");
      });

      it("includes task prompt in command", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const indexTs = result.get(".pi/extensions/mason-mcp/index.ts")!;
        expect(indexTs).toContain("./prompts/triage.md");
      });

      it("shows [no prompt defined] when task has no prompt", () => {
        const agent = makePiAgent();
        agent.roles[1].tasks[0].prompt = undefined;
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const indexTs = result.get(".pi/extensions/mason-mcp/index.ts")!;
        expect(indexTs).toContain("[no prompt defined]");
      });

      it("is a valid-looking TypeScript module with default export", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const indexTs = result.get(".pi/extensions/mason-mcp/index.ts")!;
        expect(indexTs).toContain("export default (pi) => {");
        expect(indexTs.trim().endsWith("};")).toBe(true);
      });
    });

    describe("skills directory", () => {
      it("materializes SKILL.md and companion files under skills/", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        expect(result.has("skills/labeling/SKILL.md")).toBe(true);
        expect(result.has("skills/labeling/examples/example1.md")).toBe(true);
        expect(result.has("skills/labeling/schemas/labels.json")).toBe(true);
      });

      it("includes actual skill content in materialized files", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const skillMd = result.get("skills/labeling/SKILL.md")!;
        expect(skillMd).toContain("Issue labeling taxonomy and heuristics");
      });

      it("copies companion file content verbatim", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        expect(result.get("skills/labeling/examples/example1.md")).toBe("Example content");
        expect(result.get("skills/labeling/schemas/labels.json")).toBe('{"labels": []}');
      });

      it("deduplicates skills across roles", () => {
        const agent = makePiAgent();
        agent.roles[1].skills = [makeLabelingSkill()];

        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const skillEntries = [...result.keys()].filter((k) => k.startsWith("skills/labeling/"));
        expect(skillEntries).toHaveLength(3); // SKILL.md + 2 companions
      });
    });

    describe("agent-launch.json", () => {
      it("generates agent-launch.json with pi command", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const launchJson = result.get("agent-launch.json");
        expect(launchJson).toBeDefined();

        const config = JSON.parse(launchJson!);
        expect(config.command).toBe("pi");
      });

      it("includes role-declared credentials as env type", () => {
        const agent = makePiAgent();
        agent.credentials = ["OPENROUTER_API_KEY"];
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const config = JSON.parse(result.get("agent-launch.json")!);
        const cred = config.credentials.find(
          (c: { key: string }) => c.key === "OPENROUTER_API_KEY",
        );
        expect(cred).toBeDefined();
        expect(cred.type).toBe("env");
      });

      it("appends initialPrompt as final positional in args", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(
          agent, "http://mcp-proxy:9090", undefined, { initialPrompt: "do this task" },
        );

        const config = JSON.parse(result.get("agent-launch.json")!);
        expect(config.args).toBeDefined();
        expect(config.args[config.args.length - 1]).toBe("do this task");
      });

      it("omits initialPrompt from args when not provided", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const config = JSON.parse(result.get("agent-launch.json")!);
        expect(config.args).toBeUndefined();
      });
    });

    describe(".pi/APPEND_SYSTEM.md", () => {
      it("emits .pi/APPEND_SYSTEM.md when first role has instructions", () => {
        const agent = makePiAgent();
        agent.roles[0].instructions = "You are a helpful assistant focused on triage.";
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        expect(result.has(".pi/APPEND_SYSTEM.md")).toBe(true);
        expect(result.get(".pi/APPEND_SYSTEM.md")).toBe("You are a helpful assistant focused on triage.");
      });

      it("omits .pi/APPEND_SYSTEM.md when first role has no instructions", () => {
        const agent = makePiAgent();
        agent.roles[0].instructions = undefined;
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        expect(result.has(".pi/APPEND_SYSTEM.md")).toBe(false);
      });
    });

    describe("result completeness", () => {
      it("contains all expected files for pi agent without instructions", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090");

        const keys = [...result.keys()].sort();
        expect(keys).toEqual([
          ".pi/extensions/mason-mcp/index.ts",
          ".pi/extensions/mason-mcp/package.json",
          ".pi/mcp.json",
          ".pi/prompts/@clawmasons/task-review-pr.md",
          ".pi/prompts/@clawmasons/task-triage-issue.md",
          ".pi/settings.json",
          "agent-launch.json",
          "skills/labeling/SKILL.md",
          "skills/labeling/examples/example1.md",
          "skills/labeling/schemas/labels.json",
        ]);
      });
    });

    describe("ACP mode", () => {
      it("does not generate .mason/acp.json even in ACP mode", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090", undefined, { acpMode: true });

        expect(result.has(".mason/acp.json")).toBe(false);
      });

      it("still generates all standard workspace files in ACP mode", () => {
        const agent = makePiAgent();
        const result = piCodingAgentMaterializer.materializeWorkspace(agent, "http://mcp-proxy:9090", undefined, { acpMode: true });

        expect(result.has(".pi/settings.json")).toBe(true);
        expect(result.has(".pi/mcp.json")).toBe(true);
        expect(result.has(".pi/extensions/mason-mcp/index.ts")).toBe(true);
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
