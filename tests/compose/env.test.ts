import { describe, expect, it } from "vitest";
import { generateEnvTemplate } from "../../src/compose/env.js";
import type { ResolvedAgent, ResolvedApp, ResolvedRole } from "../../src/resolver/types.js";

function makeGithubApp(): ResolvedApp {
  return {
    name: "@clawforge/app-github",
    version: "1.2.0",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_TOKEN}" },
    tools: ["create_issue", "list_repos"],
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
        allow: ["create_issue", "list_repos"],
        deny: [],
      },
      "@clawforge/app-slack": {
        allow: ["send_message"],
        deny: [],
      },
    },
    tasks: [],
    apps: [githubApp, slackApp],
    skills: [],
  };

  return {
    name: "@clawforge/agent-repo-ops",
    version: "1.0.0",
    runtimes: ["claude-code", "codex"],
    roles: [issueManager],
    proxy: {
      port: 9090,
      type: "sse",
    },
  };
}

describe("generateEnvTemplate", () => {
  describe("proxy section", () => {
    it("includes PAM_PROXY_TOKEN", () => {
      const agent = makeRepoOpsAgent();
      const env = generateEnvTemplate(agent);
      expect(env).toContain("PAM_PROXY_TOKEN=");
    });

    it("includes PAM_PROXY_PORT with default port", () => {
      const agent = makeRepoOpsAgent();
      const env = generateEnvTemplate(agent);
      expect(env).toContain("PAM_PROXY_PORT=9090");
    });

    it("uses custom port", () => {
      const agent = makeRepoOpsAgent();
      agent.proxy = { port: 8080, type: "sse" };
      const env = generateEnvTemplate(agent);
      expect(env).toContain("PAM_PROXY_PORT=8080");
    });

    it("uses default port when no proxy field", () => {
      const agent = makeRepoOpsAgent();
      delete agent.proxy;
      const env = generateEnvTemplate(agent);
      expect(env).toContain("PAM_PROXY_PORT=9090");
    });

    it("has # Proxy comment header", () => {
      const agent = makeRepoOpsAgent();
      const env = generateEnvTemplate(agent);
      expect(env).toContain("# Proxy");
    });
  });

  describe("app credentials section", () => {
    it("includes app env vars extracted from ${VAR} interpolation", () => {
      const agent = makeRepoOpsAgent();
      const env = generateEnvTemplate(agent);
      expect(env).toContain("GITHUB_TOKEN=");
      expect(env).toContain("SLACK_BOT_TOKEN=");
    });

    it("extracts interpolated variable name, not the key name", () => {
      const agent = makeRepoOpsAgent();
      const env = generateEnvTemplate(agent);
      // The key is GITHUB_PERSONAL_ACCESS_TOKEN but the interpolated var is GITHUB_TOKEN
      expect(env).toContain("GITHUB_TOKEN=");
      expect(env).not.toContain("GITHUB_PERSONAL_ACCESS_TOKEN=");
    });

    it("deduplicates env vars when multiple apps reference same variable", () => {
      const agent = makeRepoOpsAgent();
      // Make both apps reference GITHUB_TOKEN
      agent.roles[0].apps[1].env = { SLACK_BOT_TOKEN: "${GITHUB_TOKEN}" };
      const env = generateEnvTemplate(agent);

      const matches = env.match(/^GITHUB_TOKEN=/gm);
      expect(matches).toHaveLength(1);
    });

    it("has # App Credentials comment header", () => {
      const agent = makeRepoOpsAgent();
      const env = generateEnvTemplate(agent);
      expect(env).toContain("# App Credentials");
    });

    it("handles apps with no env vars", () => {
      const agent = makeRepoOpsAgent();
      // Remove env from all apps
      for (const role of agent.roles) {
        for (const app of role.apps) {
          delete app.env;
        }
      }
      const env = generateEnvTemplate(agent);
      // Should still have the section header but no app vars
      expect(env).toContain("# App Credentials");
    });
  });

  describe("runtime auth section", () => {
    it("does not include CLAUDE_AUTH_TOKEN for claude-code runtime (login on first run)", () => {
      const agent = makeRepoOpsAgent();
      agent.runtimes = ["claude-code"];
      const env = generateEnvTemplate(agent);
      expect(env).not.toContain("CLAUDE_AUTH_TOKEN=");
    });

    it("does not include ANTHROPIC_API_KEY for claude-code runtime", () => {
      const agent = makeRepoOpsAgent();
      agent.runtimes = ["claude-code"];
      const env = generateEnvTemplate(agent);
      expect(env).not.toContain("ANTHROPIC_API_KEY=");
    });

    it("includes OPENAI_API_KEY for codex runtime", () => {
      const agent = makeRepoOpsAgent();
      agent.runtimes = ["codex"];
      const env = generateEnvTemplate(agent);
      expect(env).toContain("OPENAI_API_KEY=");
    });

    it("includes only codex auth var for multi-runtime agent", () => {
      const agent = makeRepoOpsAgent();
      const env = generateEnvTemplate(agent);
      expect(env).not.toContain("CLAUDE_AUTH_TOKEN=");
      expect(env).toContain("OPENAI_API_KEY=");
    });

    it("skips unknown runtimes gracefully", () => {
      const agent = makeRepoOpsAgent();
      agent.runtimes = ["aider"];
      const env = generateEnvTemplate(agent);
      // Should not crash, just no key for aider
      expect(env).toContain("# Runtime Auth");
    });

    it("has # Runtime Auth comment header", () => {
      const agent = makeRepoOpsAgent();
      const env = generateEnvTemplate(agent);
      expect(env).toContain("# Runtime Auth");
    });
  });

  describe("section ordering", () => {
    it("has sections in order: Proxy, App Credentials, Runtime Auth", () => {
      const agent = makeRepoOpsAgent();
      const env = generateEnvTemplate(agent);

      const proxyIdx = env.indexOf("# Proxy");
      const appIdx = env.indexOf("# App Credentials");
      const runtimeIdx = env.indexOf("# Runtime Auth");

      expect(proxyIdx).toBeLessThan(appIdx);
      expect(appIdx).toBeLessThan(runtimeIdx);
    });
  });
});
