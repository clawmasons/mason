import { describe, expect, it } from "vitest";
import { generateDockerCompose } from "../../src/compose/docker-compose.js";
import type { ComposeServiceDef } from "../../src/materializer/types.js";
import type { ResolvedAgent, ResolvedApp, ResolvedRole } from "../../src/resolver/types.js";

function makeGithubApp(): ResolvedApp {
  return {
    name: "@clawforge/app-github",
    version: "1.2.0",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_TOKEN}" },
    tools: ["create_issue", "list_repos", "add_label", "delete_repo"],
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
    tools: ["send_message"],
    capabilities: ["tools"],
  };
}

function makeRepoOpsAgent(): ResolvedAgent {
  const githubApp = makeGithubApp();
  const slackApp = makeSlackApp();

  const issueManager: ResolvedRole = {
    name: "@clawforge/role-issue-manager",
    version: "2.0.0",
    permissions: {
      "@clawforge/app-github": {
        allow: ["create_issue", "list_repos", "add_label"],
        deny: ["delete_repo"],
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

  return {
    name: "@clawforge/agent-repo-ops",
    version: "1.0.0",
    runtimes: ["claude-code"],
    roles: [issueManager],
    proxy: {
      image: "ghcr.io/tbxark/mcp-proxy:latest",
      port: 9090,
      type: "sse",
    },
  };
}

function makeClaudeCodeService(): ComposeServiceDef {
  return {
    build: "./claude-code",
    restart: "no",
    volumes: ["./claude-code/workspace:/home/node/workspace"],
    working_dir: "/home/node/workspace",
    environment: ["CLAUDE_AUTH_TOKEN=${CLAUDE_AUTH_TOKEN}", "PAM_ROLES=issue-manager"],
    depends_on: ["mcp-proxy"],
    stdin_open: true,
    tty: true,
    networks: ["agent-net"],
  };
}

function makeCodexService(): ComposeServiceDef {
  return {
    build: "./codex",
    restart: "no",
    volumes: ["./codex/workspace:/workspace"],
    working_dir: "/workspace",
    environment: ["OPENAI_API_KEY=${OPENAI_API_KEY}", "PAM_ROLES=issue-manager"],
    depends_on: ["mcp-proxy"],
    stdin_open: true,
    tty: true,
    networks: ["agent-net"],
  };
}

describe("generateDockerCompose", () => {
  describe("mcp-proxy service", () => {
    it("uses default proxy image", () => {
      const agent = makeRepoOpsAgent();
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(agent, services);

      expect(yaml).toContain("image: ghcr.io/tbxark/mcp-proxy:latest");
    });

    it("uses custom proxy image", () => {
      const agent = makeRepoOpsAgent();
      agent.proxy = { image: "custom/proxy:v2", port: 9090, type: "sse" };
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(agent, services);

      expect(yaml).toContain("image: custom/proxy:v2");
    });

    it("maps proxy port with PAM_PROXY_PORT default", () => {
      const agent = makeRepoOpsAgent();
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(agent, services);

      expect(yaml).toContain('"${PAM_PROXY_PORT:-9090}:9090"');
    });

    it("uses custom port", () => {
      const agent = makeRepoOpsAgent();
      agent.proxy = { port: 8080, type: "sse" };
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(agent, services);

      expect(yaml).toContain('"${PAM_PROXY_PORT:-8080}:8080"');
    });

    it("mounts mcp-proxy config as read-only", () => {
      const agent = makeRepoOpsAgent();
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(agent, services);

      expect(yaml).toContain("./mcp-proxy/config.json:/config/config.json:ro");
    });

    it("has restart unless-stopped", () => {
      const agent = makeRepoOpsAgent();
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(agent, services);

      // The proxy service should have restart: unless-stopped
      const proxySection = yaml.split("claude-code:")[0];
      expect(proxySection).toContain("restart: unless-stopped");
    });

    it("collects app environment variables", () => {
      const agent = makeRepoOpsAgent();
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(agent, services);

      expect(yaml).toContain("GITHUB_TOKEN=${GITHUB_TOKEN}");
      expect(yaml).toContain("SLACK_BOT_TOKEN=${SLACK_BOT_TOKEN}");
    });

    it("always includes PAM_PROXY_TOKEN in mcp-proxy environment", () => {
      const agent = makeRepoOpsAgent();
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(agent, services);

      const proxySection = yaml.split("claude-code:")[0];
      expect(proxySection).toContain("PAM_PROXY_TOKEN=${PAM_PROXY_TOKEN}");
    });

    it("includes JSON logging config", () => {
      const agent = makeRepoOpsAgent();
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(agent, services);

      expect(yaml).toContain("driver: json-file");
      expect(yaml).toContain('max-size: "10m"');
      expect(yaml).toContain('max-file: "5"');
    });

    it("connects to agent-net", () => {
      const agent = makeRepoOpsAgent();
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(agent, services);

      // Proxy section should reference agent-net
      const proxySection = yaml.split("claude-code:")[0];
      expect(proxySection).toContain("agent-net");
    });

    it("uses defaults when agent has no proxy field", () => {
      const agent = makeRepoOpsAgent();
      delete agent.proxy;
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(agent, services);

      expect(yaml).toContain("image: ghcr.io/tbxark/mcp-proxy:latest");
      expect(yaml).toContain('"${PAM_PROXY_PORT:-9090}:9090"');
    });
  });

  describe("runtime services", () => {
    it("includes single runtime service", () => {
      const agent = makeRepoOpsAgent();
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(agent, services);

      expect(yaml).toContain("claude-code:");
      expect(yaml).toContain("build: ./claude-code");
      expect(yaml).toContain("CLAUDE_AUTH_TOKEN=${CLAUDE_AUTH_TOKEN}");
    });

    it("includes multiple runtime services", () => {
      const agent = makeRepoOpsAgent();
      agent.runtimes = ["claude-code", "codex"];
      const services = new Map<string, ComposeServiceDef>([
        ["claude-code", makeClaudeCodeService()],
        ["codex", makeCodexService()],
      ]);
      const yaml = generateDockerCompose(agent, services);

      expect(yaml).toContain("claude-code:");
      expect(yaml).toContain("codex:");
      expect(yaml).toContain("build: ./codex");
      expect(yaml).toContain("OPENAI_API_KEY=${OPENAI_API_KEY}");
    });

    it("renders depends_on for runtime services", () => {
      const agent = makeRepoOpsAgent();
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(agent, services);

      // After the claude-code service starts, check depends_on is rendered
      const claudeSection = yaml.split("claude-code:")[1];
      expect(claudeSection).toContain("depends_on:");
      expect(claudeSection).toContain("- mcp-proxy");
    });

    it("renders interactive mode flags", () => {
      const agent = makeRepoOpsAgent();
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(agent, services);

      expect(yaml).toContain("stdin_open: true");
      expect(yaml).toContain("tty: true");
    });
  });

  describe("networks", () => {
    it("declares agent-net bridge network", () => {
      const agent = makeRepoOpsAgent();
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(agent, services);

      expect(yaml).toContain("networks:");
      expect(yaml).toContain("agent-net:");
      expect(yaml).toContain("driver: bridge");
    });
  });

  describe("proxy Dockerfile support", () => {
    it("uses build: ./mcp-proxy when hasProxyDockerfile is true", () => {
      const agent = makeRepoOpsAgent();
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(agent, services, true);

      expect(yaml).toContain("build: ./mcp-proxy");
      expect(yaml).not.toContain("image: ghcr.io/tbxark/mcp-proxy:latest");
    });

    it("uses image: when hasProxyDockerfile is false", () => {
      const agent = makeRepoOpsAgent();
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(agent, services, false);

      expect(yaml).toContain("image: ghcr.io/tbxark/mcp-proxy:latest");
      expect(yaml).not.toContain("build: ./mcp-proxy");
    });

    it("uses image: when hasProxyDockerfile is undefined (backward compatible)", () => {
      const agent = makeRepoOpsAgent();
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(agent, services);

      expect(yaml).toContain("image: ghcr.io/tbxark/mcp-proxy:latest");
      expect(yaml).not.toContain("build: ./mcp-proxy");
    });
  });

  describe("env var deduplication", () => {
    it("deduplicates env vars when multiple apps reference the same variable", () => {
      const agent = makeRepoOpsAgent();
      // Both apps reference the same env var
      agent.roles[0].apps[1].env = { SLACK_BOT_TOKEN: "${GITHUB_TOKEN}" };
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(agent, services);

      // GITHUB_TOKEN should appear only once in the proxy environment
      const proxySection = yaml.split("claude-code:")[0];
      const matches = proxySection.match(/GITHUB_TOKEN/g);
      // Appears twice: once as VAR=, once as ${VAR} on same line
      expect(matches).toHaveLength(2);
    });
  });
});
