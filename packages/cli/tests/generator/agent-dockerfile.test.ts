import { describe, expect, it } from "vitest";
import { generateAgentDockerfile } from "../../src/generator/agent-dockerfile.js";
import { generateProxyDockerfile } from "../../src/generator/proxy-dockerfile.js";
import type { ResolvedAgent, ResolvedApp, ResolvedRole, ResolvedSkill, ResolvedTask } from "@clawmasons/shared";

// ── Test Helpers ───────────────────────────────────────────────────────

function makeGithubApp(): ResolvedApp {
  return {
    name: "@acme.platform/app-github",
    version: "1.0.0",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_TOKEN}" },
    tools: ["create_issue", "list_repos", "create_pr"],
    capabilities: ["tools"],
    credentials: [],
  };
}

function makeFilesystemApp(): ResolvedApp {
  return {
    name: "@acme.platform/app-filesystem",
    version: "1.0.0",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem"],
    tools: ["read_file", "write_file", "list_directory"],
    capabilities: ["tools"],
    credentials: [],
  };
}

function makeLabelingSkill(): ResolvedSkill {
  return {
    name: "@acme.platform/skill-labeling",
    version: "1.0.0",
    artifacts: ["./SKILL.md"],
    description: "Issue labeling heuristics",
  };
}

function makeTriageTask(): ResolvedTask {
  return {
    name: "@acme.platform/task-triage-issue",
    version: "1.0.0",
    taskType: "subagent",
    prompt: "./prompts/triage.md",
    requiredApps: ["@acme.platform/app-github"],
    apps: [makeGithubApp()],
    skills: [makeLabelingSkill()],
    subTasks: [],
  };
}

function makeWriteTask(): ResolvedTask {
  return {
    name: "@acme.platform/task-write-notes",
    version: "1.0.0",
    taskType: "subagent",
    prompt: "./prompts/write.md",
    requiredApps: ["@acme.platform/app-filesystem"],
    apps: [makeFilesystemApp()],
    skills: [],
    subTasks: [],
  };
}

function makeWriterRole(): ResolvedRole {
  return {
    name: "@acme.platform/role-writer",
    version: "1.0.0",
    description: "Writes and manages markdown notes.",
    risk: "LOW",
    permissions: {
      "@acme.platform/app-filesystem": {
        allow: ["read_file", "write_file", "list_directory"],
        deny: [],
      },
    },
    tasks: [makeWriteTask()],
    apps: [makeFilesystemApp()],
    skills: [],
  };
}

function makeReviewerRole(): ResolvedRole {
  return {
    name: "@acme.platform/role-reviewer",
    version: "1.0.0",
    description: "Reviews issues and PRs.",
    risk: "LOW",
    permissions: {
      "@acme.platform/app-github": {
        allow: ["create_issue", "list_repos"],
        deny: [],
      },
    },
    tasks: [makeTriageTask()],
    apps: [makeGithubApp()],
    skills: [makeLabelingSkill()],
  };
}

function makeNoteTakerAgent(): ResolvedAgent {
  return {
    name: "@acme.platform/agent-note-taker",
    version: "1.0.0",
    agentName: "Note Taker",
    slug: "note-taker",
    description: "Note-taking agent",
    runtimes: ["claude-code"],
    credentials: [],
    roles: [makeWriterRole(), makeReviewerRole()],
    proxy: { port: 9090, type: "sse" },
    llm: { provider: "anthropic", model: "claude-sonnet-4-6" },
  };
}

// ── Agent Dockerfile Tests ─────────────────────────────────────────────

describe("generateAgentDockerfile", () => {
  it("returns a non-empty Dockerfile string", () => {
    const agent = makeNoteTakerAgent();
    const result = generateAgentDockerfile(agent, agent.roles[0]);

    expect(result).toBeTypeOf("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("uses node:22-slim as base image", () => {
    const agent = makeNoteTakerAgent();
    const result = generateAgentDockerfile(agent, agent.roles[0]);

    expect(result).toContain("FROM node:22-slim");
  });

  it("sets USER mason", () => {
    const agent = makeNoteTakerAgent();
    const result = generateAgentDockerfile(agent, agent.roles[0]);

    expect(result).toContain("USER mason");
  });

  it("creates mason user with home directory", () => {
    const agent = makeNoteTakerAgent();
    const result = generateAgentDockerfile(agent, agent.roles[0]);

    expect(result).toContain("groupadd -r mason");
    expect(result).toContain("useradd -r -g mason -m mason");
  });

  it("sets up workspace/project directory structure", () => {
    const agent = makeNoteTakerAgent();
    const result = generateAgentDockerfile(agent, agent.roles[0]);

    expect(result).toContain("/home/mason/workspace/project");
    expect(result).toContain("WORKDIR /home/mason/workspace/project");
  });

  it("includes header comment with agent and role names", () => {
    const agent = makeNoteTakerAgent();
    const writerRole = agent.roles[0];
    const result = generateAgentDockerfile(agent, writerRole);

    expect(result).toContain("note-taker");
    expect(result).toContain("writer");
  });

  it("copies materialized workspace files", () => {
    const agent = makeNoteTakerAgent();
    const writerRole = agent.roles[0];
    const result = generateAgentDockerfile(agent, writerRole);

    expect(result).toContain("COPY writer/claude-code/workspace/");
    expect(result).toContain("/home/mason/workspace/");
  });

  it("installs claude-code runtime for claude-code agents", () => {
    const agent = makeNoteTakerAgent();
    const result = generateAgentDockerfile(agent, agent.roles[0]);

    expect(result).toContain("claude-code");
    expect(result).toContain('ENTRYPOINT ["claude"]');
  });

  it("installs pi-coding-agent runtime for pi agents", () => {
    const agent = makeNoteTakerAgent();
    agent.runtimes = ["pi-coding-agent"];
    const result = generateAgentDockerfile(agent, agent.roles[0]);

    expect(result).toContain("pi-coding-agent");
    expect(result).toContain('ENTRYPOINT ["pi"]');
  });

  it("handles unknown runtime gracefully", () => {
    const agent = makeNoteTakerAgent();
    agent.runtimes = ["custom-runtime"];
    const result = generateAgentDockerfile(agent, agent.roles[0]);

    expect(result).toContain("custom-runtime");
    expect(result).toContain('ENTRYPOINT ["npx", "custom-runtime"]');
  });

  it("does not include LLM provider env vars (passed via compose)", () => {
    const agent = makeNoteTakerAgent();
    const result = generateAgentDockerfile(agent, agent.roles[0]);

    expect(result).not.toContain("ANTHROPIC_API_KEY");
    expect(result).not.toContain("OPENROUTER_API_KEY");
    expect(result).not.toContain("LLM provider environment");
  });

  it("copies node_modules from local build context", () => {
    const agent = makeNoteTakerAgent();
    const result = generateAgentDockerfile(agent, agent.roles[0]);

    expect(result).toContain("COPY node_modules/ /app/node_modules/");
  });

  it("does not reference any registry pull", () => {
    const agent = makeNoteTakerAgent();
    const result = generateAgentDockerfile(agent, agent.roles[0]);

    expect(result).not.toContain("docker.io");
    expect(result).not.toContain("ghcr.io");
    expect(result).not.toContain("registry");
  });

  it("generates different Dockerfiles per role", () => {
    const agent = makeNoteTakerAgent();
    const writerResult = generateAgentDockerfile(agent, agent.roles[0]);
    const reviewerResult = generateAgentDockerfile(agent, agent.roles[1]);

    // They should differ in workspace COPY paths
    expect(writerResult).toContain("writer/claude-code/workspace/");
    expect(reviewerResult).toContain("reviewer/claude-code/workspace/");
  });

  // ── ACP Mode Tests ────────────────────────────────────────────────────

  it("ACP mode: uses claude-agent-acp entrypoint for claude-code runtime", () => {
    const agent = makeNoteTakerAgent();
    const result = generateAgentDockerfile(agent, agent.roles[0], { acpMode: true });

    expect(result).toContain('ENTRYPOINT ["claude-agent-acp"]');
    expect(result).not.toContain('ENTRYPOINT ["claude"]');
  });

  it("ACP mode: uses pi-agent-acp entrypoint for pi-coding-agent runtime", () => {
    const agent = makeNoteTakerAgent();
    agent.runtimes = ["pi-coding-agent"];
    const result = generateAgentDockerfile(agent, agent.roles[0], { acpMode: true });

    expect(result).toContain('ENTRYPOINT ["pi-agent-acp"]');
    expect(result).not.toContain('ENTRYPOINT ["pi"]');
  });

  it("ACP mode: uses split command for node runtime", () => {
    const agent = makeNoteTakerAgent();
    agent.runtimes = ["node"];
    const result = generateAgentDockerfile(agent, agent.roles[0], { acpMode: true });

    expect(result).toContain('ENTRYPOINT ["node","src/index.js","--acp"]');
  });

  it("ACP mode: falls back to default entrypoint for unknown runtime", () => {
    const agent = makeNoteTakerAgent();
    agent.runtimes = ["custom-runtime"];
    const result = generateAgentDockerfile(agent, agent.roles[0], { acpMode: true });

    expect(result).toContain('ENTRYPOINT ["npx", "custom-runtime"]');
    expect(result).toContain("ACP mode requested but no ACP command mapping");
  });

  it("ACP mode: includes [ACP mode] marker in header comment", () => {
    const agent = makeNoteTakerAgent();
    const result = generateAgentDockerfile(agent, agent.roles[0], { acpMode: true });

    expect(result).toContain("[ACP mode]");
  });

  it("ACP mode: non-ACP header does not include [ACP mode] marker", () => {
    const agent = makeNoteTakerAgent();
    const result = generateAgentDockerfile(agent, agent.roles[0]);

    expect(result).not.toContain("[ACP mode]");
  });

  it("ACP mode: acpMode false behaves same as omitted", () => {
    const agent = makeNoteTakerAgent();
    const withFalse = generateAgentDockerfile(agent, agent.roles[0], { acpMode: false });
    const withoutOption = generateAgentDockerfile(agent, agent.roles[0]);

    expect(withFalse).toBe(withoutOption);
  });

  it("ACP mode: still installs the runtime even in ACP mode", () => {
    const agent = makeNoteTakerAgent();
    const result = generateAgentDockerfile(agent, agent.roles[0], { acpMode: true });

    expect(result).toContain("npm install -g @anthropic-ai/claude-code");
  });

  // ── Base Image Tests ──────────────────────────────────────────────────

  it("uses custom baseImage from role when specified", () => {
    const agent = makeNoteTakerAgent();
    const role = { ...agent.roles[0], baseImage: "node:22-bookworm" };
    const result = generateAgentDockerfile(agent, role);

    expect(result).toContain("FROM node:22-bookworm");
    expect(result).not.toContain("FROM node:22-slim");
  });

  it("falls back to node:22-slim when baseImage is undefined", () => {
    const agent = makeNoteTakerAgent();
    const role = { ...agent.roles[0] };
    delete role.baseImage;
    const result = generateAgentDockerfile(agent, role);

    expect(result).toContain("FROM node:22-slim");
  });

  // ── Apt Packages Tests ────────────────────────────────────────────────

  it("includes apt-get install step when aptPackages specified", () => {
    const agent = makeNoteTakerAgent();
    const role = { ...agent.roles[0], aptPackages: ["git", "curl", "jq"] };
    const result = generateAgentDockerfile(agent, role);

    expect(result).toContain("apt-get update");
    expect(result).toContain("apt-get install -y --no-install-recommends git curl jq");
    expect(result).toContain("rm -rf /var/lib/apt/lists/*");
  });

  it("does not include apt-get step when aptPackages is undefined", () => {
    const agent = makeNoteTakerAgent();
    const role = { ...agent.roles[0] };
    delete role.aptPackages;
    const result = generateAgentDockerfile(agent, role);

    expect(result).not.toContain("apt-get");
  });

  it("does not include apt-get step when aptPackages is empty", () => {
    const agent = makeNoteTakerAgent();
    const role = { ...agent.roles[0], aptPackages: [] };
    const result = generateAgentDockerfile(agent, role);

    expect(result).not.toContain("apt-get");
  });

  it("Dockerfile without baseImage or aptPackages is unchanged from default", () => {
    const agent = makeNoteTakerAgent();
    const role = { ...agent.roles[0] };
    delete role.baseImage;
    delete role.aptPackages;
    const result = generateAgentDockerfile(agent, role);

    expect(result).toContain("FROM node:22-slim");
    expect(result).not.toContain("apt-get");
  });

  it("combines baseImage and aptPackages correctly", () => {
    const agent = makeNoteTakerAgent();
    const role = {
      ...agent.roles[0],
      baseImage: "ubuntu:24.04",
      aptPackages: ["python3", "make"],
    };
    const result = generateAgentDockerfile(agent, role);

    expect(result).toContain("FROM ubuntu:24.04");
    expect(result).toContain("apt-get install -y --no-install-recommends python3 make");
  });
});

// ── Proxy Dockerfile Tests ─────────────────────────────────────────────

describe("generateProxyDockerfile", () => {
  it("returns a non-empty Dockerfile string", () => {
    const agent = makeNoteTakerAgent();
    const result = generateProxyDockerfile(agent.roles[0], agent.name);

    expect(result).toBeTypeOf("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("uses node:22-slim as base image", () => {
    const agent = makeNoteTakerAgent();
    const result = generateProxyDockerfile(agent.roles[0], agent.name);

    expect(result).toContain("FROM node:22-slim");
  });

  it("sets USER mason", () => {
    const agent = makeNoteTakerAgent();
    const result = generateProxyDockerfile(agent.roles[0], agent.name);

    expect(result).toContain("USER mason");
  });

  it("creates mason user", () => {
    const agent = makeNoteTakerAgent();
    const result = generateProxyDockerfile(agent.roles[0], agent.name);

    expect(result).toContain("groupadd -r mason");
    expect(result).toContain("useradd -r -g mason -m mason");
  });

  it("installs build tools for native addons", () => {
    const agent = makeNoteTakerAgent();
    const result = generateProxyDockerfile(agent.roles[0], agent.name);

    expect(result).toContain("python3 make g++");
  });

  it("uses clawmasons proxy as entrypoint with agent name", () => {
    const agent = makeNoteTakerAgent();
    const result = generateProxyDockerfile(agent.roles[0], agent.name);

    expect(result).toContain('ENTRYPOINT ["node", "node_modules/.bin/clawmasons"]');
    expect(result).toContain('CMD ["chapter", "proxy", "--agent", "@acme.platform/agent-note-taker", "--transport", "streamable-http"]');
  });

  it("includes role name in header comment", () => {
    const agent = makeNoteTakerAgent();
    const result = generateProxyDockerfile(agent.roles[0], agent.name);

    expect(result).toContain("writer");
  });

  it("copies node_modules from local build context", () => {
    const agent = makeNoteTakerAgent();
    const result = generateProxyDockerfile(agent.roles[0], agent.name);

    expect(result).toContain("COPY node_modules/ ./node_modules/");
  });

  it("does not reference any registry pull", () => {
    const agent = makeNoteTakerAgent();
    const result = generateProxyDockerfile(agent.roles[0], agent.name);

    expect(result).not.toContain("docker.io");
    expect(result).not.toContain("ghcr.io");
  });

  it("embeds the correct agent name in CMD", () => {
    const agent = makeNoteTakerAgent();
    const result = generateProxyDockerfile(agent.roles[0], agent.name);

    expect(result).toContain("@acme.platform/agent-note-taker");
  });

  it("generates different header comments per role", () => {
    const agent = makeNoteTakerAgent();
    const writerResult = generateProxyDockerfile(agent.roles[0], agent.name);
    const reviewerResult = generateProxyDockerfile(agent.roles[1], agent.name);

    expect(writerResult).toContain("role: writer");
    expect(reviewerResult).toContain("role: reviewer");
  });
});
