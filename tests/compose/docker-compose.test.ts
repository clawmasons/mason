import { describe, expect, it } from "vitest";
import { generateDockerCompose } from "../../src/compose/docker-compose.js";
import type { ComposeServiceDef } from "../../src/materializer/types.js";
import type { ResolvedAgent, ResolvedApp, ResolvedRole } from "../../src/resolver/types.js";

function makeGithubApp(): ResolvedApp {
  return {
    name: "@clawmasons/app-github",
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
    name: "@clawmasons/app-slack",
    version: "1.0.0",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-slack"],
    env: { SLACK_BOT_TOKEN: "${SLACK_BOT_TOKEN}" },
    tools: ["send_message"],
    capabilities: ["tools"],
  };
}

function makeRepoOpsMember(): ResolvedAgent {
  const githubApp = makeGithubApp();
  const slackApp = makeSlackApp();

  const issueManager: ResolvedRole = {
    name: "@clawmasons/role-issue-manager",
    version: "2.0.0",
    permissions: {
      "@clawmasons/app-github": {
        allow: ["create_issue", "list_repos", "add_label"],
        deny: ["delete_repo"],
      },
      "@clawmasons/app-slack": {
        allow: ["send_message"],
        deny: ["*"],
      },
    },
    tasks: [],
    apps: [githubApp, slackApp],
    skills: [],
  };

  return {
    name: "@clawmasons/agent-repo-ops",
    version: "1.0.0",
    agentName: "Repo Ops",
    slug: "repo-ops",
    runtimes: ["claude-code"],
    roles: [issueManager],
    proxy: {
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
    environment: ["CLAUDE_AUTH_TOKEN=${CLAUDE_AUTH_TOKEN}", "CHAPTER_ROLES=issue-manager"],
    depends_on: ["mcp-proxy"],
    stdin_open: true,
    tty: true,
    init: true,
    networks: ["chapter-net"],
  };
}

function makeCodexService(): ComposeServiceDef {
  return {
    build: "./codex",
    restart: "no",
    volumes: ["./codex/workspace:/workspace"],
    working_dir: "/workspace",
    environment: ["OPENAI_API_KEY=${OPENAI_API_KEY}", "CHAPTER_ROLES=issue-manager"],
    depends_on: ["mcp-proxy"],
    stdin_open: true,
    tty: true,
    init: true,
    networks: ["chapter-net"],
  };
}

describe("generateDockerCompose", () => {
  describe("chapter proxy service", () => {
    it("always uses build: ./proxy", () => {
      const member = makeRepoOpsMember();
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(member, services);

      expect(yaml).toContain("build: ./proxy");
      expect(yaml).not.toContain("build: ./chapter-proxy");
    });

    it("does not reference mcp-proxy image or binary", () => {
      const member = makeRepoOpsMember();
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(member, services);

      expect(yaml).not.toContain("ghcr.io/tbxark/mcp-proxy");
      expect(yaml).not.toContain("image:");
    });

    it("maps proxy port with CHAPTER_PROXY_PORT default", () => {
      const member = makeRepoOpsMember();
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(member, services);

      expect(yaml).toContain('"${CHAPTER_PROXY_PORT:-9090}:9090"');
    });

    it("uses custom port", () => {
      const member = makeRepoOpsMember();
      member.proxy = { port: 8080, type: "sse" };
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(member, services);

      expect(yaml).toContain('"${CHAPTER_PROXY_PORT:-8080}:8080"');
    });

    it("mounts proxy logs directory", () => {
      const member = makeRepoOpsMember();
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(member, services);

      expect(yaml).toContain("./proxy/logs:/logs");
    });

    it("mounts data directory for persistent DB", () => {
      const member = makeRepoOpsMember();
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(member, services);

      expect(yaml).toContain("./data:/home/node/data");
    });

    it("sets CHAPTER_DB_PATH environment variable", () => {
      const member = makeRepoOpsMember();
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(member, services);

      const proxySection = yaml.split("claude-code:")[0];
      expect(proxySection).toContain("CHAPTER_DB_PATH=/home/node/data/chapter.db");
    });

    it("does not mount config.json", () => {
      const member = makeRepoOpsMember();
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(member, services);

      expect(yaml).not.toContain("config.json");
    });

    it("does not have mcp-proxy entrypoint or command", () => {
      const member = makeRepoOpsMember();
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(member, services);

      expect(yaml).not.toContain("entrypoint:");
      expect(yaml).not.toContain("command:");
    });

    it("has restart unless-stopped", () => {
      const member = makeRepoOpsMember();
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(member, services);

      const proxySection = yaml.split("claude-code:")[0];
      expect(proxySection).toContain("restart: unless-stopped");
    });

    it("collects app environment variables", () => {
      const member = makeRepoOpsMember();
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(member, services);

      expect(yaml).toContain("GITHUB_TOKEN=${GITHUB_TOKEN}");
      expect(yaml).toContain("SLACK_BOT_TOKEN=${SLACK_BOT_TOKEN}");
    });

    it("always includes CHAPTER_PROXY_TOKEN in environment", () => {
      const member = makeRepoOpsMember();
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(member, services);

      const proxySection = yaml.split("claude-code:")[0];
      expect(proxySection).toContain("CHAPTER_PROXY_TOKEN=${CHAPTER_PROXY_TOKEN}");
    });

    it("includes JSON logging config", () => {
      const member = makeRepoOpsMember();
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(member, services);

      expect(yaml).toContain("driver: json-file");
      expect(yaml).toContain('max-size: "10m"');
      expect(yaml).toContain('max-file: "5"');
    });

    it("connects to chapter-net", () => {
      const member = makeRepoOpsMember();
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(member, services);

      const proxySection = yaml.split("claude-code:")[0];
      expect(proxySection).toContain("chapter-net");
    });

    it("uses defaults when member has no proxy field", () => {
      const member = makeRepoOpsMember();
      delete member.proxy;
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(member, services);

      expect(yaml).toContain("build: ./proxy");
      expect(yaml).toContain('"${CHAPTER_PROXY_PORT:-9090}:9090"');
    });
  });

  describe("runtime services", () => {
    it("includes single runtime service", () => {
      const member = makeRepoOpsMember();
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(member, services);

      expect(yaml).toContain("claude-code:");
      expect(yaml).toContain("build: ./claude-code");
      expect(yaml).toContain("CLAUDE_AUTH_TOKEN=${CLAUDE_AUTH_TOKEN}");
    });

    it("includes multiple runtime services", () => {
      const member = makeRepoOpsMember();
      member.runtimes = ["claude-code", "codex"];
      const services = new Map<string, ComposeServiceDef>([
        ["claude-code", makeClaudeCodeService()],
        ["codex", makeCodexService()],
      ]);
      const yaml = generateDockerCompose(member, services);

      expect(yaml).toContain("claude-code:");
      expect(yaml).toContain("codex:");
      expect(yaml).toContain("build: ./codex");
      expect(yaml).toContain("OPENAI_API_KEY=${OPENAI_API_KEY}");
    });

    it("renders depends_on for runtime services", () => {
      const member = makeRepoOpsMember();
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(member, services);

      const claudeSection = yaml.split("claude-code:")[1];
      expect(claudeSection).toContain("depends_on:");
      expect(claudeSection).toContain("- mcp-proxy");
    });

    it("renders interactive mode flags", () => {
      const member = makeRepoOpsMember();
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(member, services);

      expect(yaml).toContain("stdin_open: true");
      expect(yaml).toContain("tty: true");
    });

    it("renders init flag for proper PID 1 signal handling", () => {
      const member = makeRepoOpsMember();
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(member, services);

      expect(yaml).toContain("init: true");
    });
  });

  describe("networks", () => {
    it("declares chapter-net bridge network", () => {
      const member = makeRepoOpsMember();
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(member, services);

      expect(yaml).toContain("networks:");
      expect(yaml).toContain("chapter-net:");
      expect(yaml).toContain("driver: bridge");
    });
  });

  describe("env var deduplication", () => {
    it("deduplicates env vars when multiple apps reference the same variable", () => {
      const member = makeRepoOpsMember();
      // Both apps reference the same env var
      member.roles[0].apps[1].env = { SLACK_BOT_TOKEN: "${GITHUB_TOKEN}" };
      const services = new Map([["claude-code", makeClaudeCodeService()]]);
      const yaml = generateDockerCompose(member, services);

      // GITHUB_TOKEN should appear only once in the proxy environment
      const proxySection = yaml.split("claude-code:")[0];
      const matches = proxySection.match(/GITHUB_TOKEN/g);
      // Appears twice: once as VAR=, once as ${VAR} on same line
      expect(matches).toHaveLength(2);
    });
  });
});
