import { describe, expect, it } from "vitest";
import { generateEnvTemplate } from "../../src/compose/env.js";
import type { ResolvedMember, ResolvedApp, ResolvedRole } from "../../src/resolver/types.js";

function makeGithubApp(): ResolvedApp {
  return {
    name: "@clawmasons/app-github",
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

function makeRepoOpsMember(): ResolvedMember {
  const githubApp = makeGithubApp();
  const slackApp = makeSlackApp();

  const issueManager: ResolvedRole = {
    name: "@clawmasons/role-issue-manager",
    version: "2.0.0",
    permissions: {
      "@clawmasons/app-github": {
        allow: ["create_issue", "list_repos"],
        deny: [],
      },
      "@clawmasons/app-slack": {
        allow: ["send_message"],
        deny: [],
      },
    },
    tasks: [],
    apps: [githubApp, slackApp],
    skills: [],
  };

  return {
    name: "@clawmasons/member-repo-ops",
    version: "1.0.0",
    memberType: "agent",
    memberName: "Repo Ops",
    slug: "repo-ops",
    email: "repo-ops@chapter.local",
    authProviders: [],
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
    it("includes CHAPTER_PROXY_TOKEN", () => {
      const member = makeRepoOpsMember();
      const env = generateEnvTemplate(member);
      expect(env).toContain("CHAPTER_PROXY_TOKEN=");
    });

    it("includes CHAPTER_PROXY_PORT with default port", () => {
      const member = makeRepoOpsMember();
      const env = generateEnvTemplate(member);
      expect(env).toContain("CHAPTER_PROXY_PORT=9090");
    });

    it("uses custom port", () => {
      const member = makeRepoOpsMember();
      member.proxy = { port: 8080, type: "sse" };
      const env = generateEnvTemplate(member);
      expect(env).toContain("CHAPTER_PROXY_PORT=8080");
    });

    it("uses default port when no proxy field", () => {
      const member = makeRepoOpsMember();
      delete member.proxy;
      const env = generateEnvTemplate(member);
      expect(env).toContain("CHAPTER_PROXY_PORT=9090");
    });

    it("has # Proxy comment header", () => {
      const member = makeRepoOpsMember();
      const env = generateEnvTemplate(member);
      expect(env).toContain("# Proxy");
    });
  });

  describe("app credentials section", () => {
    it("includes app env vars extracted from ${VAR} interpolation", () => {
      const member = makeRepoOpsMember();
      const env = generateEnvTemplate(member);
      expect(env).toContain("GITHUB_TOKEN=");
      expect(env).toContain("SLACK_BOT_TOKEN=");
    });

    it("extracts interpolated variable name, not the key name", () => {
      const member = makeRepoOpsMember();
      const env = generateEnvTemplate(member);
      // The key is GITHUB_PERSONAL_ACCESS_TOKEN but the interpolated var is GITHUB_TOKEN
      expect(env).toContain("GITHUB_TOKEN=");
      expect(env).not.toContain("GITHUB_PERSONAL_ACCESS_TOKEN=");
    });

    it("deduplicates env vars when multiple apps reference same variable", () => {
      const member = makeRepoOpsMember();
      // Make both apps reference GITHUB_TOKEN
      member.roles[0].apps[1].env = { SLACK_BOT_TOKEN: "${GITHUB_TOKEN}" };
      const env = generateEnvTemplate(member);

      const matches = env.match(/^GITHUB_TOKEN=/gm);
      expect(matches).toHaveLength(1);
    });

    it("has # App Credentials comment header", () => {
      const member = makeRepoOpsMember();
      const env = generateEnvTemplate(member);
      expect(env).toContain("# App Credentials");
    });

    it("handles apps with no env vars", () => {
      const member = makeRepoOpsMember();
      // Remove env from all apps
      for (const role of member.roles) {
        for (const app of role.apps) {
          delete app.env;
        }
      }
      const env = generateEnvTemplate(member);
      // Should still have the section header but no app vars
      expect(env).toContain("# App Credentials");
    });
  });

  describe("runtime auth section", () => {
    it("does not include CLAUDE_AUTH_TOKEN for claude-code runtime (login on first run)", () => {
      const member = makeRepoOpsMember();
      member.runtimes = ["claude-code"];
      const env = generateEnvTemplate(member);
      expect(env).not.toContain("CLAUDE_AUTH_TOKEN=");
    });

    it("does not include ANTHROPIC_API_KEY for claude-code runtime", () => {
      const member = makeRepoOpsMember();
      member.runtimes = ["claude-code"];
      const env = generateEnvTemplate(member);
      expect(env).not.toContain("ANTHROPIC_API_KEY=");
    });

    it("includes OPENAI_API_KEY for codex runtime", () => {
      const member = makeRepoOpsMember();
      member.runtimes = ["codex"];
      const env = generateEnvTemplate(member);
      expect(env).toContain("OPENAI_API_KEY=");
    });

    it("includes only codex auth var for multi-runtime agent", () => {
      const member = makeRepoOpsMember();
      const env = generateEnvTemplate(member);
      expect(env).not.toContain("CLAUDE_AUTH_TOKEN=");
      expect(env).toContain("OPENAI_API_KEY=");
    });

    it("skips unknown runtimes gracefully", () => {
      const member = makeRepoOpsMember();
      member.runtimes = ["aider"];
      const env = generateEnvTemplate(member);
      // Should not crash, just no key for aider
      expect(env).toContain("# Runtime Auth");
    });

    it("has # Runtime Auth comment header", () => {
      const member = makeRepoOpsMember();
      const env = generateEnvTemplate(member);
      expect(env).toContain("# Runtime Auth");
    });

    it("includes OPENROUTER_API_KEY for pi-coding-agent member with openrouter llm", () => {
      const member = makeRepoOpsMember();
      member.runtimes = ["pi-coding-agent"];
      member.llm = { provider: "openrouter", model: "anthropic/claude-sonnet-4" };
      const env = generateEnvTemplate(member);
      expect(env).toContain("OPENROUTER_API_KEY=");
    });

    it("includes ANTHROPIC_API_KEY for pi-coding-agent member with anthropic llm", () => {
      const member = makeRepoOpsMember();
      member.runtimes = ["pi-coding-agent"];
      member.llm = { provider: "anthropic", model: "claude-opus-4" };
      const env = generateEnvTemplate(member);
      expect(env).toContain("ANTHROPIC_API_KEY=");
    });

    it("deduplicates when runtime and llm provider map to same env var", () => {
      const member = makeRepoOpsMember();
      member.runtimes = ["codex"];
      member.llm = { provider: "openai", model: "gpt-4o" };
      const env = generateEnvTemplate(member);
      // Both codex runtime and openai llm provider map to OPENAI_API_KEY
      const matches = env.match(/^OPENAI_API_KEY=/gm);
      expect(matches).toHaveLength(1);
    });

    it("does not include LLM env var when member has no llm config", () => {
      const member = makeRepoOpsMember();
      member.runtimes = ["pi-coding-agent"];
      delete member.llm;
      const env = generateEnvTemplate(member);
      expect(env).not.toContain("OPENROUTER_API_KEY=");
    });

    it("skips LLM env var for unknown provider", () => {
      const member = makeRepoOpsMember();
      member.runtimes = ["pi-coding-agent"];
      member.llm = { provider: "custom-self-hosted", model: "my-model" };
      const env = generateEnvTemplate(member);
      // Should not crash and should not add any unknown env var
      expect(env).toContain("# Runtime Auth");
    });
  });

  describe("section ordering", () => {
    it("has sections in order: Proxy, App Credentials, Runtime Auth", () => {
      const member = makeRepoOpsMember();
      const env = generateEnvTemplate(member);

      const proxyIdx = env.indexOf("# Proxy");
      const appIdx = env.indexOf("# App Credentials");
      const runtimeIdx = env.indexOf("# Runtime Auth");

      expect(proxyIdx).toBeLessThan(appIdx);
      expect(appIdx).toBeLessThan(runtimeIdx);
    });
  });
});
