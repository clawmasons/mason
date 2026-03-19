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
    runtimes: ["claude-code-agent"],
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

  it("creates mason user with host-matching UID/GID", () => {
    const agent = makeNoteTakerAgent();
    const result = generateAgentDockerfile(agent, agent.roles[0]);

    expect(result).toContain("ARG HOST_UID=1000");
    expect(result).toContain("ARG HOST_GID=1000");
    expect(result).toContain("groupadd -g $HOST_GID mason");
    expect(result).toContain("useradd -m -u $HOST_UID -g $HOST_GID mason");
    // Handles pre-existing GID/UID (e.g., node:22-slim ships with GID 1000)
    expect(result).toContain("getent group $HOST_GID");
    expect(result).toContain("getent passwd $HOST_UID");
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

    expect(result).toContain("COPY writer/claude-code-agent/build/workspace/");
    expect(result).toContain("/home/mason/workspace/");
    expect(result).not.toContain("COPY writer/claude-code-agent/workspace/");
  });

  it("installs claude-code-agent runtime and uses agent-entry entrypoint", () => {
    const agent = makeNoteTakerAgent();
    const result = generateAgentDockerfile(agent, agent.roles[0]);

    expect(result).toContain("claude-code-agent");
    expect(result).toContain('ENTRYPOINT ["agent-entry"]');
  });

  it("installs pi-coding-agent runtime and uses agent-entry entrypoint", () => {
    const agent = makeNoteTakerAgent();
    agent.runtimes = ["pi-coding-agent"];
    const result = generateAgentDockerfile(agent, agent.roles[0]);

    expect(result).toContain("pi-coding-agent");
    expect(result).toContain('ENTRYPOINT ["agent-entry"]');
  });

  it("uses agent-entry entrypoint for all runtimes including unknown", () => {
    const agent = makeNoteTakerAgent();
    agent.runtimes = ["custom-runtime"];
    const result = generateAgentDockerfile(agent, agent.roles[0]);

    expect(result).toContain("custom-runtime");
    expect(result).toContain('ENTRYPOINT ["agent-entry"]');
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

  it("adds node_modules/.bin to PATH for agent-entry access", () => {
    const agent = makeNoteTakerAgent();
    const result = generateAgentDockerfile(agent, agent.roles[0]);

    expect(result).toContain('ENV PATH="/app/node_modules/.bin:$PATH"');
  });

  it("creates .claude directory for credential file installation", () => {
    const agent = makeNoteTakerAgent();
    const result = generateAgentDockerfile(agent, agent.roles[0]);

    expect(result).toContain("/home/mason/.claude");
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
    expect(writerResult).toContain("writer/claude-code-agent/build/workspace/");
    expect(reviewerResult).toContain("reviewer/claude-code-agent/build/workspace/");
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

  // ── Npm Packages Tests ───────────────────────────────────────────────

  it("includes npm install -g step when role npmPackages specified", () => {
    const agent = makeNoteTakerAgent();
    const role = { ...agent.roles[0], npmPackages: ["typescript", "@fission-ai/openspec@latest"] };
    const result = generateAgentDockerfile(agent, role);

    expect(result).toContain("npm install -g typescript @fission-ai/openspec@latest");
  });

  it("does not include npm install step when npmPackages is undefined", () => {
    const agent = makeNoteTakerAgent();
    const role = { ...agent.roles[0] };
    delete role.npmPackages;
    const result = generateAgentDockerfile(agent, role);

    expect(result).not.toContain("npm install -g");
  });

  it("does not include npm install step when npmPackages is empty", () => {
    const agent = makeNoteTakerAgent();
    const role = { ...agent.roles[0], npmPackages: [] };
    const result = generateAgentDockerfile(agent, role);

    expect(result).not.toContain("npm install -g");
  });

  it("merges and deduplicates npm packages from agent dockerfileConfig and role", () => {
    const agent = makeNoteTakerAgent();
    const role = { ...agent.roles[0], npmPackages: ["typescript"] };
    const result = generateAgentDockerfile(agent, role, {
      dockerfileConfig: { npmPackages: ["typescript", "@fission-ai/openspec@latest"] },
    });

    const matches = result.match(/npm install -g (.+)/);
    expect(matches).not.toBeNull();
    const packages = matches![1].split(" ");
    expect(packages).toContain("typescript");
    expect(packages).toContain("@fission-ai/openspec@latest");
    // deduplicated — typescript appears only once
    expect(packages.filter((p) => p === "typescript")).toHaveLength(1);
  });

  it("npm install step appears after apt-get and before groupadd", () => {
    const agent = makeNoteTakerAgent();
    const role = {
      ...agent.roles[0],
      aptPackages: ["git"],
      npmPackages: ["typescript"],
    };
    const result = generateAgentDockerfile(agent, role);

    const aptPos = result.indexOf("apt-get update");
    const npmPos = result.indexOf("npm install -g");
    const groupaddPos = result.indexOf("groupadd");

    expect(aptPos).toBeGreaterThan(-1);
    expect(npmPos).toBeGreaterThan(aptPos);
    expect(groupaddPos).toBeGreaterThan(npmPos);
  });

  // ── Home Directory Tests ────────────────────────────────────────────

  it("does not include home COPY when hasHome is false", () => {
    const agent = makeNoteTakerAgent();
    const result = generateAgentDockerfile(agent, agent.roles[0], { hasHome: false });

    expect(result).not.toContain("COPY writer/claude-code-agent/home/");
    expect(result).not.toContain("mason-from-build");
  });

  it("does not include home COPY when options omitted", () => {
    const agent = makeNoteTakerAgent();
    const result = generateAgentDockerfile(agent, agent.roles[0]);

    expect(result).not.toContain("mason-from-build");
  });

  it("includes home COPY and backup when hasHome is true", () => {
    const agent = makeNoteTakerAgent();
    const result = generateAgentDockerfile(agent, agent.roles[0], { hasHome: true });

    expect(result).toContain("COPY writer/claude-code-agent/home/ /home/mason/");
    expect(result).toContain("chown -R mason:mason /home/mason");
    expect(result).toContain("cp -a /home/mason /home/mason-from-build");
  });

  it("uses correct role/runtime path for home COPY", () => {
    const agent = makeNoteTakerAgent();
    const reviewerResult = generateAgentDockerfile(agent, agent.roles[1], { hasHome: true });

    expect(reviewerResult).toContain("COPY reviewer/claude-code-agent/home/ /home/mason/");
  });

  // ── Role Type Tests ────────────────────────────────────────────────────

  it("uses WORKDIR /home/mason/workspace/project for project role type (default)", () => {
    const agent = makeNoteTakerAgent();
    const result = generateAgentDockerfile(agent, agent.roles[0]);

    expect(result).toContain("WORKDIR /home/mason/workspace/project");
    expect(result).not.toContain("WORKDIR /home/mason/workspace\n");
  });

  it("uses WORKDIR /home/mason/workspace for supervisor role type", () => {
    const agent = makeNoteTakerAgent();
    const result = generateAgentDockerfile(agent, agent.roles[0], { roleType: "supervisor" });

    expect(result).toContain("WORKDIR /home/mason/workspace\n");
    expect(result).not.toContain("WORKDIR /home/mason/workspace/project");
  });

  it("omits build/workspace COPY for supervisor role (directory does not exist)", () => {
    const agent = makeNoteTakerAgent();
    const result = generateAgentDockerfile(agent, agent.roles[0], { roleType: "supervisor" });

    expect(result).not.toContain("build/workspace/");
  });

  it("includes build/workspace COPY for project role", () => {
    const agent = makeNoteTakerAgent();
    const result = generateAgentDockerfile(agent, agent.roles[0]);

    expect(result).toContain("build/workspace/");
  });

  it("sets workspaceFolder to /home/mason/workspace/project in devcontainer label for project role", () => {
    const agent = makeNoteTakerAgent();
    const result = generateAgentDockerfile(agent, agent.roles[0]);

    expect(result).toContain('"workspaceFolder":"/home/mason/workspace/project"');
  });

  it("sets workspaceFolder to /home/mason/workspace in devcontainer label for supervisor role", () => {
    const agent = makeNoteTakerAgent();
    const result = generateAgentDockerfile(agent, agent.roles[0], { roleType: "supervisor" });

    expect(result).toContain('"workspaceFolder":"/home/mason/workspace"');
    expect(result).not.toContain('"workspaceFolder":"/home/mason/workspace/project"');
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

  it("creates mason user with host-matching UID/GID", () => {
    const agent = makeNoteTakerAgent();
    const result = generateProxyDockerfile(agent.roles[0], agent.name);

    expect(result).toContain("ARG HOST_UID=1000");
    expect(result).toContain("ARG HOST_GID=1000");
    expect(result).toContain("groupadd -g $HOST_GID mason");
    expect(result).toContain("useradd -m -u $HOST_UID -g $HOST_GID mason");
    expect(result).toContain("getent group $HOST_GID");
  });

  it("installs build tools for native addons", () => {
    const agent = makeNoteTakerAgent();
    const result = generateProxyDockerfile(agent.roles[0], agent.name);

    expect(result).toContain("python3 make g++");
  });

  it("uses bundled proxy entry point with agent name", () => {
    const agent = makeNoteTakerAgent();
    const result = generateProxyDockerfile(agent.roles[0], agent.name);

    expect(result).toContain('ENTRYPOINT ["node", "proxy-bundle.cjs"]');
    expect(result).toContain('CMD ["--agent", "@acme.platform/agent-note-taker", "--transport", "streamable-http"]');
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

  it("sets NODE_COMPILE_CACHE and NPM_CONFIG_CACHE env vars", () => {
    const agent = makeNoteTakerAgent();
    const result = generateProxyDockerfile(agent.roles[0], agent.name);

    expect(result).toContain("ENV NODE_COMPILE_CACHE=/app/.cache/v8");
    expect(result).toContain("ENV NPM_CONFIG_CACHE=/app/.cache/npm");
  });

  it("creates both v8 and npm cache directories", () => {
    const agent = makeNoteTakerAgent();
    const result = generateProxyDockerfile(agent.roles[0], agent.name);

    expect(result).toContain("/app/.cache/v8");
    expect(result).toContain("/app/.cache/npm");
  });
});

// ── devcontainer.metadata LABEL ────────────────────────────────────────────

describe("generateAgentDockerfile devcontainer.metadata label", () => {
  it("injects LABEL devcontainer.metadata with default customizations when none provided", () => {
    const agent = makeNoteTakerAgent();
    const result = generateAgentDockerfile(agent, agent.roles[0]);

    expect(result).toContain("LABEL devcontainer.metadata=");
    expect(result).toContain("remoteUser");
    expect(result).toContain("mason");
    expect(result).toContain("/home/mason/workspace/project");
    // Default extensions
    expect(result).toContain("anthropic.claude-code");
  });

  it("uses provided devContainerCustomizations instead of default", () => {
    const agent = makeNoteTakerAgent();
    const custom = {
      vscode: {
        extensions: ["my-publisher.my-extension"],
        settings: { "editor.tabSize": 2 },
      },
    };
    const result = generateAgentDockerfile(agent, agent.roles[0], { devContainerCustomizations: custom });

    expect(result).toContain("my-publisher.my-extension");
    expect(result).not.toContain("anthropic.claude-code");
  });

  it("label value is valid compact JSON parseable as an array", () => {
    const agent = makeNoteTakerAgent();
    const result = generateAgentDockerfile(agent, agent.roles[0]);

    const match = result.match(/LABEL devcontainer\.metadata='(.+)'/);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]) as unknown[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
  });
});
