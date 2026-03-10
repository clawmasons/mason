import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  AcpSession,
  generateAcpComposeYml,
  generateInfraComposeYml,
  generateAgentComposeYml,
  type AcpSessionConfig,
  type AcpSessionDeps,
} from "../../src/acp/session.js";
import type { RunConfig } from "../../src/cli/commands/run-init.js";

// ── Test Helpers ──────────────────────────────────────────────────────

function setupProjectDir(tmpDir: string): { projectDir: string; dockerBuildPath: string } {
  const dockerBuildPath = path.join(tmpDir, "chapter-project", "docker");

  // Create proxy, agent, and credential service Dockerfiles
  fs.mkdirSync(path.join(dockerBuildPath, "proxy", "writer"), { recursive: true });
  fs.writeFileSync(path.join(dockerBuildPath, "proxy", "writer", "Dockerfile"), "FROM node:22\n");
  fs.mkdirSync(path.join(dockerBuildPath, "agent", "note-taker", "writer"), { recursive: true });
  fs.writeFileSync(
    path.join(dockerBuildPath, "agent", "note-taker", "writer", "Dockerfile"),
    "FROM node:22\n",
  );
  fs.mkdirSync(path.join(dockerBuildPath, "credential-service"), { recursive: true });
  fs.writeFileSync(
    path.join(dockerBuildPath, "credential-service", "Dockerfile"),
    "FROM node:22\n",
  );

  // Set up project directory with .clawmasons/chapter.json
  const projectDir = path.join(tmpDir, "my-project");
  fs.mkdirSync(path.join(projectDir, ".clawmasons"), { recursive: true });

  const runConfig: RunConfig = {
    chapter: "acme.platform",
    "docker-registries": ["local"],
    "docker-build": dockerBuildPath,
  };
  fs.writeFileSync(
    path.join(projectDir, ".clawmasons", "chapter.json"),
    JSON.stringify(runConfig, null, 2),
  );

  return { projectDir, dockerBuildPath };
}

function makeMockDeps(overrides?: {
  upExitCode?: number;
  downExitCode?: number;
  sessionId?: string;
}): {
  calls: Array<{ composeFile: string; args: string[]; opts?: { interactive?: boolean } }>;
  deps: AcpSessionDeps;
} {
  const calls: Array<{ composeFile: string; args: string[]; opts?: { interactive?: boolean } }> = [];

  return {
    calls,
    deps: {
      generateSessionIdFn: () => overrides?.sessionId ?? "abcd1234",
      checkDockerComposeFn: () => {},
      execComposeFn: async (
        composeFile: string,
        args: string[],
        opts?: { interactive?: boolean },
      ) => {
        calls.push({ composeFile, args, opts });
        if (args.includes("down")) {
          return overrides?.downExitCode ?? 0;
        }
        return overrides?.upExitCode ?? 0;
      },
    },
  };
}

// ── generateAcpComposeYml ─────────────────────────────────────────────

describe("generateAcpComposeYml", () => {
  const defaultOpts = {
    dockerBuildPath: "/chapters/acme/docker",
    projectDir: "/projects/my-project",
    agent: "note-taker",
    role: "writer",
    logsDir: "/projects/my-project/.clawmasons/logs",
    proxyToken: "test-proxy-token",
    credentialProxyToken: "test-cred-token",
    acpPort: 3002,
  };

  it("generates three services: proxy, credential-service, and agent", () => {
    const yml = generateAcpComposeYml(defaultOpts);

    expect(yml).toContain("proxy-writer:");
    expect(yml).toContain("credential-service:");
    expect(yml).toContain("agent-note-taker-writer:");
  });

  it("agent service has no stdin_open or tty (non-interactive)", () => {
    const yml = generateAcpComposeYml(defaultOpts);
    const agentSection = yml.split("agent-note-taker-writer:")[1]!;

    expect(agentSection).not.toContain("stdin_open");
    expect(agentSection).not.toContain("tty");
  });

  it("agent service has init: true", () => {
    const yml = generateAcpComposeYml(defaultOpts);
    const agentSection = yml.split("agent-note-taker-writer:")[1]!;

    expect(agentSection).toContain("init: true");
  });

  it("agent service exposes ACP port", () => {
    const yml = generateAcpComposeYml(defaultOpts);
    const agentSection = yml.split("agent-note-taker-writer:")[1]!;

    expect(agentSection).toContain('"3002:3002"');
  });

  it("uses custom ACP port", () => {
    const yml = generateAcpComposeYml({ ...defaultOpts, acpPort: 4444 });
    const agentSection = yml.split("agent-note-taker-writer:")[1]!;

    expect(agentSection).toContain('"4444:4444"');
  });

  it("credential-service gets CREDENTIAL_SESSION_OVERRIDES when credentials provided", () => {
    const yml = generateAcpComposeYml({
      ...defaultOpts,
      credentials: {
        GITHUB_TOKEN: "ghp_abc123",
        SLACK_TOKEN: "xoxb-456",
      },
    });

    const credSection = yml.split("credential-service:")[1]!.split("agent-note-taker-writer:")[0]!;
    expect(credSection).toContain("CREDENTIAL_SESSION_OVERRIDES=");
    expect(credSection).toContain("GITHUB_TOKEN");
    expect(credSection).toContain("ghp_abc123");
  });

  it("credential-service has no CREDENTIAL_SESSION_OVERRIDES when no credentials", () => {
    const yml = generateAcpComposeYml(defaultOpts);

    const credSection = yml.split("credential-service:")[1]!.split("agent-note-taker-writer:")[0]!;
    expect(credSection).not.toContain("CREDENTIAL_SESSION_OVERRIDES");
  });

  it("credential-service has no CREDENTIAL_SESSION_OVERRIDES when credentials are empty", () => {
    const yml = generateAcpComposeYml({ ...defaultOpts, credentials: {} });

    const credSection = yml.split("credential-service:")[1]!.split("agent-note-taker-writer:")[0]!;
    expect(credSection).not.toContain("CREDENTIAL_SESSION_OVERRIDES");
  });

  it("proxy has correct tokens", () => {
    const yml = generateAcpComposeYml(defaultOpts);
    const proxySection = yml.split("credential-service:")[0]!;

    expect(proxySection).toContain("CHAPTER_PROXY_TOKEN=test-proxy-token");
    expect(proxySection).toContain("CREDENTIAL_PROXY_TOKEN=test-cred-token");
  });

  it("agent has only MCP_PROXY_TOKEN", () => {
    const yml = generateAcpComposeYml(defaultOpts);
    const agentSection = yml.split("agent-note-taker-writer:")[1]!;

    expect(agentSection).toContain("MCP_PROXY_TOKEN=test-proxy-token");
    expect(agentSection).not.toContain("CHAPTER_PROXY_TOKEN");
    expect(agentSection).not.toContain("CREDENTIAL_PROXY_TOKEN");
  });

  it("credential-service depends on proxy", () => {
    const yml = generateAcpComposeYml(defaultOpts);
    const credSection = yml.split("credential-service:")[1]!.split("agent-note-taker-writer:")[0]!;

    expect(credSection).toContain("depends_on:");
    expect(credSection).toContain("- proxy-writer");
  });

  it("agent depends on credential-service", () => {
    const yml = generateAcpComposeYml(defaultOpts);
    const agentSection = yml.split("agent-note-taker-writer:")[1]!;

    expect(agentSection).toContain("depends_on:");
    expect(agentSection).toContain("- credential-service");
  });

  it("uses correct Dockerfile paths", () => {
    const yml = generateAcpComposeYml(defaultOpts);

    expect(yml).toContain('dockerfile: "proxy/writer/Dockerfile"');
    expect(yml).toContain('dockerfile: "credential-service/Dockerfile"');
    expect(yml).toContain('dockerfile: "agent/note-taker/writer/Dockerfile"');
  });

  it("includes workspace volume mount for proxy and agent", () => {
    const yml = generateAcpComposeYml(defaultOpts);

    const proxySection = yml.split("credential-service:")[0]!;
    const agentSection = yml.split("agent-note-taker-writer:")[1]!;

    expect(proxySection).toContain('"/projects/my-project:/workspace"');
    expect(agentSection).toContain('"/projects/my-project:/workspace"');
  });
});

// ── AcpSession ────────────────────────────────────────────────────────

describe("AcpSession", () => {
  let tmpDir: string;
  let projectDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-acp-session-test-"));
    const setup = setupProjectDir(tmpDir);
    projectDir = setup.projectDir;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeConfig(overrides?: Partial<AcpSessionConfig>): AcpSessionConfig {
    return {
      projectDir,
      agent: "note-taker",
      role: "writer",
      ...overrides,
    };
  }

  it("start() returns correct SessionInfo", async () => {
    const { deps } = makeMockDeps({ sessionId: "sess0001" });
    const session = new AcpSession(makeConfig(), deps);

    const info = await session.start();

    expect(info.sessionId).toBe("sess0001");
    expect(info.acpPort).toBe(3002);
    expect(info.proxyServiceName).toBe("proxy-writer");
    expect(info.agentServiceName).toBe("agent-note-taker-writer");
    expect(info.composeFile).toContain("sess0001");
    expect(info.sessionDir).toContain("sess0001");
  });

  it("start() uses custom ACP port", async () => {
    const { deps } = makeMockDeps();
    const session = new AcpSession(makeConfig({ acpPort: 5555 }), deps);

    const info = await session.start();

    expect(info.acpPort).toBe(5555);
  });

  it("start() creates session directory and compose file", async () => {
    const { deps } = makeMockDeps({ sessionId: "dir00001" });
    const session = new AcpSession(makeConfig(), deps);

    const info = await session.start();

    expect(fs.existsSync(info.sessionDir)).toBe(true);
    expect(fs.existsSync(info.composeFile)).toBe(true);

    const content = fs.readFileSync(info.composeFile, "utf-8");
    expect(content).toContain("proxy-writer:");
    expect(content).toContain("credential-service:");
    expect(content).toContain("agent-note-taker-writer:");
  });

  it("start() starts all services detached (up -d)", async () => {
    const { calls, deps } = makeMockDeps();
    const session = new AcpSession(makeConfig(), deps);

    await session.start();

    // Should call docker compose up -d (all services at once)
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args).toContain("up");
    expect(calls[0]!.args).toContain("-d");
  });

  it("start() throws when session is already running", async () => {
    const { deps } = makeMockDeps();
    const session = new AcpSession(makeConfig(), deps);

    await session.start();

    await expect(session.start()).rejects.toThrow("already running");
  });

  it("start() throws when docker compose fails", async () => {
    const { deps } = makeMockDeps({ upExitCode: 1 });
    const session = new AcpSession(makeConfig(), deps);

    await expect(session.start()).rejects.toThrow("Failed to start ACP session");
  });

  it("start() throws when docker compose is not available", async () => {
    const session = new AcpSession(makeConfig(), {
      generateSessionIdFn: () => "test1234",
      checkDockerComposeFn: () => {
        throw new Error("Docker Compose v2 is required");
      },
      execComposeFn: async () => 0,
    });

    await expect(session.start()).rejects.toThrow("Docker Compose");
  });

  it("start() passes credentials to compose", async () => {
    const { deps } = makeMockDeps({ sessionId: "cred0001" });
    const session = new AcpSession(
      makeConfig({
        credentials: { GITHUB_TOKEN: "ghp_test", SLACK_TOKEN: "xoxb-test" },
      }),
      deps,
    );

    const info = await session.start();

    const content = fs.readFileSync(info.composeFile, "utf-8");
    expect(content).toContain("CREDENTIAL_SESSION_OVERRIDES=");
    expect(content).toContain("GITHUB_TOKEN");
    expect(content).toContain("ghp_test");
  });

  it("start() compose has ACP port exposed", async () => {
    const { deps } = makeMockDeps({ sessionId: "port0001" });
    const session = new AcpSession(makeConfig({ acpPort: 3002 }), deps);

    const info = await session.start();

    const content = fs.readFileSync(info.composeFile, "utf-8");
    const agentSection = content.split("agent-note-taker-writer:")[1]!;
    expect(agentSection).toContain('"3002:3002"');
  });

  it("stop() calls docker compose down", async () => {
    const { calls, deps } = makeMockDeps();
    const session = new AcpSession(makeConfig(), deps);

    await session.start();
    await session.stop();

    expect(calls).toHaveLength(2);
    expect(calls[1]!.args).toContain("down");
  });

  it("stop() is idempotent when not running", async () => {
    const { calls, deps } = makeMockDeps();
    const session = new AcpSession(makeConfig(), deps);

    // Stop without starting -- should be no-op
    await session.stop();

    expect(calls).toHaveLength(0);
  });

  it("stop() is idempotent after already stopped", async () => {
    const { calls, deps } = makeMockDeps();
    const session = new AcpSession(makeConfig(), deps);

    await session.start();
    await session.stop();
    await session.stop(); // Second stop should be no-op

    expect(calls).toHaveLength(2); // up + down, not two downs
  });

  it("isRunning() returns false initially", () => {
    const { deps } = makeMockDeps();
    const session = new AcpSession(makeConfig(), deps);

    expect(session.isRunning()).toBe(false);
  });

  it("isRunning() returns true after start", async () => {
    const { deps } = makeMockDeps();
    const session = new AcpSession(makeConfig(), deps);

    await session.start();

    expect(session.isRunning()).toBe(true);
  });

  it("isRunning() returns false after stop", async () => {
    const { deps } = makeMockDeps();
    const session = new AcpSession(makeConfig(), deps);

    await session.start();
    await session.stop();

    expect(session.isRunning()).toBe(false);
  });

  it("creates logs directory", async () => {
    const { deps } = makeMockDeps();
    const session = new AcpSession(makeConfig(), deps);

    await session.start();

    const logsDir = path.join(projectDir, ".clawmasons", "logs");
    expect(fs.existsSync(logsDir)).toBe(true);
  });

  it("agent service has no stdin_open or tty in generated compose", async () => {
    const { deps } = makeMockDeps({ sessionId: "notty001" });
    const session = new AcpSession(makeConfig(), deps);

    const info = await session.start();

    const content = fs.readFileSync(info.composeFile, "utf-8");
    const agentSection = content.split("agent-note-taker-writer:")[1]!;
    expect(agentSection).not.toContain("stdin_open");
    expect(agentSection).not.toContain("tty");
  });

  // ── Split Lifecycle: startInfrastructure + startAgent ────────────────

  describe("split lifecycle", () => {
    it("startInfrastructure() returns InfrastructureInfo", async () => {
      const { deps } = makeMockDeps({ sessionId: "infra001" });
      const session = new AcpSession(makeConfig(), deps);

      const info = await session.startInfrastructure();

      expect(info.sessionId).toBe("infra001");
      expect(info.proxyServiceName).toBe("proxy-writer");
      expect(info.proxyToken).toBeDefined();
      expect(info.credentialProxyToken).toBeDefined();
      expect(info.dockerBuildPath).toBeDefined();
      expect(info.composeFile).toContain("infra001");
    });

    it("startInfrastructure() creates compose with only proxy and credential-service", async () => {
      const { deps } = makeMockDeps({ sessionId: "infra002" });
      const session = new AcpSession(makeConfig(), deps);

      const info = await session.startInfrastructure();

      const content = fs.readFileSync(info.composeFile, "utf-8");
      expect(content).toContain("proxy-writer:");
      expect(content).toContain("credential-service:");
      expect(content).not.toContain("agent-note-taker-writer:");
    });

    it("startInfrastructure() calls compose up -d", async () => {
      const { calls, deps } = makeMockDeps();
      const session = new AcpSession(makeConfig(), deps);

      await session.startInfrastructure();

      expect(calls).toHaveLength(1);
      expect(calls[0]!.args).toContain("up");
      expect(calls[0]!.args).toContain("-d");
    });

    it("startInfrastructure() throws when already running", async () => {
      const { deps } = makeMockDeps();
      const session = new AcpSession(makeConfig(), deps);

      await session.startInfrastructure();

      await expect(session.startInfrastructure()).rejects.toThrow("already running");
    });

    it("startInfrastructure() throws when compose fails", async () => {
      const { deps } = makeMockDeps({ upExitCode: 1 });
      const session = new AcpSession(makeConfig(), deps);

      await expect(session.startInfrastructure()).rejects.toThrow("Failed to start infrastructure");
    });

    it("startAgent() launches agent with correct projectDir", async () => {
      let sessionIdCounter = 0;
      const { calls, deps } = makeMockDeps();
      deps.generateSessionIdFn = () => `sess${String(sessionIdCounter++).padStart(4, "0")}`;
      const session = new AcpSession(makeConfig(), deps);

      await session.startInfrastructure();

      const agentDir = path.join(tmpDir, "target-project");
      fs.mkdirSync(agentDir, { recursive: true });

      const info = await session.startAgent(agentDir);

      expect(info.agentServiceName).toBe("agent-note-taker-writer");
      expect(info.projectDir).toBe(agentDir);
      expect(info.acpPort).toBe(3002);

      // Should have 2 calls: infra up, agent up
      expect(calls).toHaveLength(2);
      expect(calls[1]!.args).toContain("up");
      expect(calls[1]!.args).toContain("-d");
    });

    it("startAgent() creates compose with correct workspace mount", async () => {
      let sessionIdCounter = 0;
      const { deps } = makeMockDeps();
      deps.generateSessionIdFn = () => `sess${String(sessionIdCounter++).padStart(4, "0")}`;
      const session = new AcpSession(makeConfig(), deps);

      await session.startInfrastructure();

      const agentDir = path.join(tmpDir, "target-project");
      fs.mkdirSync(agentDir, { recursive: true });

      const info = await session.startAgent(agentDir);

      const content = fs.readFileSync(info.composeFile, "utf-8");
      expect(content).toContain("agent-note-taker-writer:");
      expect(content).toContain(`"${agentDir}:/workspace"`);
      expect(content).not.toContain("proxy-writer:");
      expect(content).not.toContain("credential-service:");
    });

    it("startAgent() throws when infrastructure is not running", async () => {
      const { deps } = makeMockDeps();
      const session = new AcpSession(makeConfig(), deps);

      await expect(session.startAgent("/some/dir")).rejects.toThrow("Infrastructure must be running");
    });

    it("startAgent() throws when agent is already running", async () => {
      let sessionIdCounter = 0;
      const { deps } = makeMockDeps();
      deps.generateSessionIdFn = () => `sess${String(sessionIdCounter++).padStart(4, "0")}`;
      const session = new AcpSession(makeConfig(), deps);

      await session.startInfrastructure();

      const agentDir = path.join(tmpDir, "target-project");
      fs.mkdirSync(agentDir, { recursive: true });

      await session.startAgent(agentDir);

      await expect(session.startAgent(agentDir)).rejects.toThrow("Agent is already running");
    });

    it("stopAgent() stops only the agent", async () => {
      let sessionIdCounter = 0;
      const { calls: composeCalls, deps } = makeMockDeps();
      deps.generateSessionIdFn = () => `sess${String(sessionIdCounter++).padStart(4, "0")}`;
      const session = new AcpSession(makeConfig(), deps);

      await session.startInfrastructure();

      const agentDir = path.join(tmpDir, "target-project");
      fs.mkdirSync(agentDir, { recursive: true });

      await session.startAgent(agentDir);
      await session.stopAgent();

      // 3 calls: infra up, agent up, agent down
      expect(composeCalls).toHaveLength(3);
      expect(composeCalls[2]!.args).toContain("down");

      // Infrastructure still running
      expect(session.isInfrastructureRunning()).toBe(true);
      expect(session.isAgentRunning()).toBe(false);
    });

    it("stopAgent() is idempotent", async () => {
      const { calls, deps } = makeMockDeps();
      const session = new AcpSession(makeConfig(), deps);

      // stopAgent when nothing is running
      await session.stopAgent();

      expect(calls).toHaveLength(0);
    });

    it("stop() tears down both agent and infrastructure", async () => {
      let sessionIdCounter = 0;
      const { calls, deps } = makeMockDeps();
      deps.generateSessionIdFn = () => `sess${String(sessionIdCounter++).padStart(4, "0")}`;
      const session = new AcpSession(makeConfig(), deps);

      await session.startInfrastructure();

      const agentDir = path.join(tmpDir, "target-project");
      fs.mkdirSync(agentDir, { recursive: true });

      await session.startAgent(agentDir);
      await session.stop();

      // 4 calls: infra up, agent up, agent down, infra down
      expect(calls).toHaveLength(4);
      expect(calls[2]!.args).toContain("down");
      expect(calls[3]!.args).toContain("down");

      expect(session.isInfrastructureRunning()).toBe(false);
      expect(session.isAgentRunning()).toBe(false);
    });

    it("can start a new agent after stopAgent()", async () => {
      let sessionIdCounter = 0;
      const { deps } = makeMockDeps();
      deps.generateSessionIdFn = () => `sess${String(sessionIdCounter++).padStart(4, "0")}`;
      const session = new AcpSession(makeConfig(), deps);

      await session.startInfrastructure();

      const dir1 = path.join(tmpDir, "project-1");
      fs.mkdirSync(dir1, { recursive: true });
      await session.startAgent(dir1);
      await session.stopAgent();

      const dir2 = path.join(tmpDir, "project-2");
      fs.mkdirSync(dir2, { recursive: true });
      const info2 = await session.startAgent(dir2);

      expect(info2.projectDir).toBe(dir2);
      // 5 calls: infra up, agent1 up, agent1 down, agent2 up... wait actually
      // let's just check the agent is running again
      expect(session.isAgentRunning()).toBe(true);
    });

    it("isInfrastructureRunning() tracks state correctly", async () => {
      const { deps } = makeMockDeps();
      const session = new AcpSession(makeConfig(), deps);

      expect(session.isInfrastructureRunning()).toBe(false);

      await session.startInfrastructure();
      expect(session.isInfrastructureRunning()).toBe(true);

      await session.stop();
      expect(session.isInfrastructureRunning()).toBe(false);
    });

    it("isAgentRunning() tracks state correctly", async () => {
      let sessionIdCounter = 0;
      const { deps } = makeMockDeps();
      deps.generateSessionIdFn = () => `sess${String(sessionIdCounter++).padStart(4, "0")}`;
      const session = new AcpSession(makeConfig(), deps);

      expect(session.isAgentRunning()).toBe(false);

      await session.startInfrastructure();
      expect(session.isAgentRunning()).toBe(false);

      const agentDir = path.join(tmpDir, "target-project");
      fs.mkdirSync(agentDir, { recursive: true });
      await session.startAgent(agentDir);
      expect(session.isAgentRunning()).toBe(true);

      await session.stopAgent();
      expect(session.isAgentRunning()).toBe(false);
    });
  });
});

// ── generateInfraComposeYml ────────────────────────────────────────────

describe("generateInfraComposeYml", () => {
  const defaultOpts = {
    dockerBuildPath: "/chapters/acme/docker",
    role: "writer",
    logsDir: "/tmp/logs",
    proxyToken: "test-proxy-token",
    credentialProxyToken: "test-cred-token",
  };

  it("generates proxy and credential-service services", () => {
    const yml = generateInfraComposeYml(defaultOpts);

    expect(yml).toContain("proxy-writer:");
    expect(yml).toContain("credential-service:");
  });

  it("does not include agent service", () => {
    const yml = generateInfraComposeYml(defaultOpts);

    expect(yml).not.toContain("agent-");
  });

  it("proxy has correct tokens", () => {
    const yml = generateInfraComposeYml(defaultOpts);

    expect(yml).toContain("CHAPTER_PROXY_TOKEN=test-proxy-token");
    expect(yml).toContain("CREDENTIAL_PROXY_TOKEN=test-cred-token");
    expect(yml).toContain("CHAPTER_SESSION_TYPE=acp");
  });

  it("proxy has logs volume mount", () => {
    const yml = generateInfraComposeYml(defaultOpts);

    expect(yml).toContain('"/tmp/logs:/logs"');
  });

  it("proxy does NOT have workspace mount", () => {
    const yml = generateInfraComposeYml(defaultOpts);

    expect(yml).not.toContain("/workspace");
  });

  it("includes credential overrides when provided", () => {
    const yml = generateInfraComposeYml({
      ...defaultOpts,
      credentials: { GITHUB_TOKEN: "ghp_test" },
    });

    expect(yml).toContain("CREDENTIAL_SESSION_OVERRIDES=");
  });

  it("includes ACP client when provided", () => {
    const yml = generateInfraComposeYml({
      ...defaultOpts,
      acpClient: "zed",
    });

    expect(yml).toContain("CHAPTER_ACP_CLIENT=zed");
  });
});

// ── generateAgentComposeYml ─────────────────────────────────────────────

describe("generateAgentComposeYml", () => {
  const defaultOpts = {
    dockerBuildPath: "/chapters/acme/docker",
    projectDir: "/projects/myapp",
    agent: "note-taker",
    role: "writer",
    proxyToken: "test-proxy-token",
    acpPort: 3002,
  };

  it("generates agent service only", () => {
    const yml = generateAgentComposeYml(defaultOpts);

    expect(yml).toContain("agent-note-taker-writer:");
    expect(yml).not.toContain("proxy-writer:");
    expect(yml).not.toContain("credential-service:");
  });

  it("mounts projectDir as /workspace", () => {
    const yml = generateAgentComposeYml(defaultOpts);

    expect(yml).toContain('"/projects/myapp:/workspace"');
  });

  it("has MCP_PROXY_TOKEN", () => {
    const yml = generateAgentComposeYml(defaultOpts);

    expect(yml).toContain("MCP_PROXY_TOKEN=test-proxy-token");
  });

  it("exposes ACP port", () => {
    const yml = generateAgentComposeYml(defaultOpts);

    expect(yml).toContain('"3002:3002"');
  });

  it("has init: true", () => {
    const yml = generateAgentComposeYml(defaultOpts);

    expect(yml).toContain("init: true");
  });

  it("uses custom ACP port", () => {
    const yml = generateAgentComposeYml({ ...defaultOpts, acpPort: 5555 });

    expect(yml).toContain('"5555:5555"');
  });
});
