import { describe, expect, it } from "vitest";
import { generateProxyConfig } from "../../src/generator/proxy-config.js";
import type { ResolvedAgent, ResolvedApp, ResolvedRole } from "../../src/resolver/types.js";

function makeGithubApp(overrides: Partial<ResolvedApp> = {}): ResolvedApp {
  return {
    name: "@clawforge/app-github",
    version: "1.2.0",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_TOKEN}" },
    tools: ["create_issue", "list_repos", "create_pr", "get_pr", "create_review", "add_label", "delete_repo", "transfer_repo"],
    capabilities: ["resources", "tools"],
    ...overrides,
  };
}

function makeSlackApp(overrides: Partial<ResolvedApp> = {}): ResolvedApp {
  return {
    name: "@clawforge/app-slack",
    version: "1.0.0",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-slack"],
    env: { SLACK_BOT_TOKEN: "${SLACK_BOT_TOKEN}" },
    tools: ["send_message", "list_channels"],
    capabilities: ["tools"],
    ...overrides,
  };
}

function makeAmapApp(): ResolvedApp {
  return {
    name: "@clawforge/app-amap",
    version: "1.0.0",
    transport: "sse",
    url: "https://mcp.amap.com/sse?key=${AMAP_KEY}",
    tools: ["get_directions", "search_places"],
    capabilities: ["tools"],
  };
}

function makeRepoOpsAgent(): ResolvedAgent {
  const githubApp = makeGithubApp();
  const slackApp = makeSlackApp();

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
    tasks: [],
    apps: [githubApp, slackApp],
    skills: [],
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
    tasks: [],
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

describe("generateProxyConfig", () => {
  describe("mcpProxy section", () => {
    it("generates correct defaults", () => {
      const agent = makeRepoOpsAgent();
      const config = generateProxyConfig(agent);

      expect(config.mcpProxy.baseURL).toBe("http://mcp-proxy:9090");
      expect(config.mcpProxy.addr).toBe(":9090");
      expect(config.mcpProxy.name).toBe("pam-proxy-repo-ops");
      expect(config.mcpProxy.version).toBe("1.0.0");
      expect(config.mcpProxy.type).toBe("sse");
      expect(config.mcpProxy.options.panicIfInvalid).toBe(false);
      expect(config.mcpProxy.options.logEnabled).toBe(true);
    });

    it("includes auth token placeholder", () => {
      const agent = makeRepoOpsAgent();
      const config = generateProxyConfig(agent);
      expect(config.mcpProxy.options.authTokens).toEqual(["${PAM_PROXY_TOKEN}"]);
    });

    it("uses custom port from agent proxy config", () => {
      const agent = makeRepoOpsAgent();
      agent.proxy = { port: 8080, type: "sse" };
      const config = generateProxyConfig(agent);

      expect(config.mcpProxy.addr).toBe(":8080");
      expect(config.mcpProxy.baseURL).toBe("http://mcp-proxy:8080");
    });

    it("uses custom type from agent proxy config", () => {
      const agent = makeRepoOpsAgent();
      agent.proxy = { port: 9090, type: "streamable-http" };
      const config = generateProxyConfig(agent);

      expect(config.mcpProxy.type).toBe("streamable-http");
    });

    it("uses defaults when agent has no proxy field", () => {
      const agent = makeRepoOpsAgent();
      delete agent.proxy;
      const config = generateProxyConfig(agent);

      expect(config.mcpProxy.addr).toBe(":9090");
      expect(config.mcpProxy.type).toBe("sse");
    });
  });

  describe("mcpServers section", () => {
    it("generates stdio app entry with command, args, env, and toolFilter", () => {
      const agent = makeRepoOpsAgent();
      const config = generateProxyConfig(agent);

      const github = config.mcpServers["github"];
      expect(github).toBeDefined();
      expect(github.command).toBe("npx");
      expect(github.args).toEqual(["-y", "@modelcontextprotocol/server-github"]);
      expect(github.env).toEqual({ GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_TOKEN}" });
      expect(github.options.logEnabled).toBe(true);
      expect(github.options.toolFilter.mode).toBe("allow");
    });

    it("generates correct toolFilter union for github (issue-manager + pr-reviewer)", () => {
      const agent = makeRepoOpsAgent();
      const config = generateProxyConfig(agent);

      const github = config.mcpServers["github"];
      const toolSet = new Set(github.options.toolFilter.list);
      expect(toolSet).toEqual(
        new Set(["create_issue", "list_repos", "add_label", "get_pr", "create_review"]),
      );
    });

    it("generates correct toolFilter for slack (issue-manager only)", () => {
      const agent = makeRepoOpsAgent();
      const config = generateProxyConfig(agent);

      const slack = config.mcpServers["slack"];
      expect(slack).toBeDefined();
      expect(slack.options.toolFilter.list).toEqual(["send_message"]);
    });

    it("generates remote (sse) app entry with url and toolFilter", () => {
      const amapApp = makeAmapApp();
      const agent: ResolvedAgent = {
        name: "@clawforge/agent-test",
        version: "1.0.0",
        runtimes: ["claude-code"],
        roles: [
          {
            name: "role-navigator",
            version: "1.0.0",
            permissions: {
              "@clawforge/app-amap": {
                allow: ["get_directions", "search_places"],
                deny: [],
              },
            },
            tasks: [],
            apps: [amapApp],
            skills: [],
          },
        ],
      };

      const config = generateProxyConfig(agent);
      const amap = config.mcpServers["amap"];
      expect(amap).toBeDefined();
      expect(amap.url).toBe("https://mcp.amap.com/sse?key=${AMAP_KEY}");
      expect(amap.command).toBeUndefined();
      expect(amap.args).toBeUndefined();
      expect(amap.options.toolFilter.list).toEqual(["get_directions", "search_places"]);
    });

    it("omits env when app has no env vars", () => {
      const app: ResolvedApp = {
        name: "app-simple",
        version: "1.0.0",
        transport: "stdio",
        command: "node",
        args: ["server.js"],
        tools: ["do_thing"],
        capabilities: ["tools"],
      };

      const agent: ResolvedAgent = {
        name: "agent-test",
        version: "1.0.0",
        runtimes: ["claude-code"],
        roles: [
          {
            name: "role-a",
            version: "1.0.0",
            permissions: { "app-simple": { allow: ["do_thing"], deny: [] } },
            tasks: [],
            apps: [app],
            skills: [],
          },
        ],
      };

      const config = generateProxyConfig(agent);
      const simple = config.mcpServers["simple"];
      expect(simple.env).toBeUndefined();
    });
  });

  describe("environment variable interpolation", () => {
    it("preserves ${VAR} syntax in env values", () => {
      const agent = makeRepoOpsAgent();
      const config = generateProxyConfig(agent);

      expect(config.mcpServers["github"].env?.GITHUB_PERSONAL_ACCESS_TOKEN).toBe("${GITHUB_TOKEN}");
      expect(config.mcpServers["slack"].env?.SLACK_BOT_TOKEN).toBe("${SLACK_BOT_TOKEN}");
    });

    it("preserves ${VAR} syntax in auth tokens", () => {
      const agent = makeRepoOpsAgent();
      const config = generateProxyConfig(agent);

      expect(config.mcpProxy.options.authTokens[0]).toBe("${PAM_PROXY_TOKEN}");
    });
  });

  describe("auth token", () => {
    it("always uses PAM_PROXY_TOKEN placeholder for proxy config", () => {
      const agent = makeRepoOpsAgent();
      const config = generateProxyConfig(agent);
      expect(config.mcpProxy.options.authTokens).toEqual(["${PAM_PROXY_TOKEN}"]);
    });
  });

  describe("JSON serialization", () => {
    it("produces valid JSON matching mcp-proxy schema structure", () => {
      const agent = makeRepoOpsAgent();
      const config = generateProxyConfig(agent);
      const json = JSON.stringify(config, null, 2);

      // Should be valid JSON
      const parsed = JSON.parse(json);
      expect(parsed.mcpProxy).toBeDefined();
      expect(parsed.mcpServers).toBeDefined();
      expect(typeof parsed.mcpProxy.addr).toBe("string");
      expect(typeof parsed.mcpProxy.type).toBe("string");
      expect(Array.isArray(parsed.mcpProxy.options.authTokens)).toBe(true);
    });
  });

  describe("PRD §6.3 repo-ops compliance", () => {
    it("generates config matching the PRD example structure", () => {
      const agent = makeRepoOpsAgent();
      const config = generateProxyConfig(agent);

      // mcpProxy
      expect(config.mcpProxy.name).toBe("pam-proxy-repo-ops");
      expect(config.mcpProxy.version).toBe("1.0.0");
      expect(config.mcpProxy.type).toBe("sse");

      // mcpServers keys
      expect(Object.keys(config.mcpServers).sort()).toEqual(["github", "slack"]);

      // github toolFilter = union of issue-manager + pr-reviewer
      const githubTools = new Set(config.mcpServers["github"].options.toolFilter.list);
      expect(githubTools).toEqual(
        new Set(["create_issue", "list_repos", "add_label", "get_pr", "create_review"]),
      );

      // slack toolFilter = issue-manager only
      expect(config.mcpServers["slack"].options.toolFilter.list).toEqual(["send_message"]);

      // Excluded tools (delete_repo, transfer_repo) not in any filter
      expect(githubTools.has("delete_repo")).toBe(false);
      expect(githubTools.has("transfer_repo")).toBe(false);
    });
  });
});
