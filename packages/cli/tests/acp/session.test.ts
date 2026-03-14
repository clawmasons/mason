import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import type { SpawnOptions } from "node:child_process";
import {
  AcpSession,
  generateAcpComposeYml,
  type AcpSessionConfig,
  type AcpSessionDeps,
} from "../../src/acp/session.js";

// ── Test Helpers ──────────────────────────────────────────────────────

function setupProjectDir(tmpDir: string): { projectDir: string; dockerBuildDir: string; dockerDir: string } {
  const dockerDir = path.join(tmpDir, "my-project", ".mason", "docker");
  const dockerBuildDir = path.join(dockerDir, "writer");

  // Create proxy and agent Dockerfiles in new layout
  fs.mkdirSync(path.join(dockerBuildDir, "mcp-proxy"), { recursive: true });
  fs.writeFileSync(path.join(dockerBuildDir, "mcp-proxy", "Dockerfile"), "FROM node:22\n");
  fs.mkdirSync(path.join(dockerBuildDir, "note-taker"), { recursive: true });
  fs.writeFileSync(path.join(dockerBuildDir, "note-taker", "Dockerfile"), "FROM node:22\n");

  // Create node_modules in shared docker dir
  fs.mkdirSync(path.join(dockerDir, "node_modules"), { recursive: true });

  // Set up project directory
  const projectDir = path.join(tmpDir, "my-project");
  fs.mkdirSync(path.join(projectDir, ".mason"), { recursive: true });

  return { projectDir, dockerBuildDir, dockerDir };
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

/**
 * Create a mock ChildProcess for testing startAgentProcess / stopAgent.
 */
function makeMockChildProcess(): ChildProcess {
  const emitter = new EventEmitter();
  const child = emitter as unknown as ChildProcess;
  Object.defineProperty(child, "pid", { value: 12345, writable: true });
  child.kill = vi.fn().mockReturnValue(true);
  child.stdin = null;
  child.stdout = null;
  child.stderr = null;
  return child;
}

function makeMockDepsWithSpawn(overrides?: {
  upExitCode?: number;
  downExitCode?: number;
  sessionId?: string;
}): {
  calls: Array<{ composeFile: string; args: string[]; opts?: { interactive?: boolean } }>;
  spawnCalls: Array<{ command: string; args: string[]; options: SpawnOptions }>;
  mockChild: ChildProcess;
  deps: AcpSessionDeps;
} {
  const { calls, deps } = makeMockDeps(overrides);
  const spawnCalls: Array<{ command: string; args: string[]; options: SpawnOptions }> = [];
  const mockChild = makeMockChildProcess();

  return {
    calls,
    spawnCalls,
    mockChild,
    deps: {
      ...deps,
      spawnFn: (command: string, args: string[], options: SpawnOptions) => {
        spawnCalls.push({ command, args, options });
        return mockChild;
      },
    },
  };
}

// ── generateAcpComposeYml ─────────────────────────────────────────────

describe("generateAcpComposeYml", () => {
  const defaultOpts = {
    dockerBuildDir: "/projects/my-project/.mason/docker/writer",
    dockerDir: "/projects/my-project/.mason/docker",
    agent: "note-taker",
    role: "writer",
    logsDir: "/projects/my-project/.mason/sessions/abc123/docker/logs",
    proxyToken: "test-proxy-token",
    credentialProxyToken: "test-cred-token",
  };

  it("generates two services: proxy and agent (no credential-service)", () => {
    const yml = generateAcpComposeYml(defaultOpts);

    expect(yml).toContain("proxy-writer:");
    expect(yml).toContain("agent-writer:");
    expect(yml).not.toContain("credential-service:");
  });

  it("agent service has profiles: [agent] so up -d skips it", () => {
    const yml = generateAcpComposeYml(defaultOpts);
    const agentSection = yml.split("agent-writer:")[1]!;

    expect(agentSection).toContain("profiles:");
    expect(agentSection).toContain("- agent");
  });

  it("agent service has no stdin_open or tty (non-interactive)", () => {
    const yml = generateAcpComposeYml(defaultOpts);
    const agentSection = yml.split("agent-writer:")[1]!;

    expect(agentSection).not.toContain("stdin_open");
    expect(agentSection).not.toContain("tty");
  });

  it("agent service has init: true", () => {
    const yml = generateAcpComposeYml(defaultOpts);
    const agentSection = yml.split("agent-writer:")[1]!;

    expect(agentSection).toContain("init: true");
  });

  it("agent service does NOT expose any ports", () => {
    const yml = generateAcpComposeYml(defaultOpts);
    const agentSection = yml.split("agent-writer:")[1]!;

    expect(agentSection).not.toContain("ports:");
    expect(agentSection).not.toContain("3002");
  });

  it("proxy has correct tokens", () => {
    const yml = generateAcpComposeYml(defaultOpts);
    const proxySection = yml.split("agent-writer:")[0]!;

    expect(proxySection).toContain("CHAPTER_PROXY_TOKEN=test-proxy-token");
    expect(proxySection).toContain("CREDENTIAL_PROXY_TOKEN=test-cred-token");
  });

  it("proxy has CHAPTER_SESSION_TYPE=acp", () => {
    const yml = generateAcpComposeYml(defaultOpts);
    const proxySection = yml.split("agent-writer:")[0]!;

    expect(proxySection).toContain("CHAPTER_SESSION_TYPE=acp");
  });

  it("proxy has PROJECT_DIR env set to project mount path", () => {
    const yml = generateAcpComposeYml(defaultOpts);
    const proxySection = yml.split("agent-writer:")[0]!;

    expect(proxySection).toContain("PROJECT_DIR=/home/mason/workspace/project");
  });

  it("proxy mounts projectDir when provided", () => {
    const yml = generateAcpComposeYml({
      ...defaultOpts,
      projectDir: "/projects/my-project",
    });
    const proxySection = yml.split("agent-writer:")[0]!;

    expect(proxySection).toContain('"/projects/my-project:/home/mason/workspace/project"');
  });

  it("proxy exposes port to host when proxyPort is set", () => {
    const yml = generateAcpComposeYml({ ...defaultOpts, proxyPort: 3000 });
    const proxySection = yml.split("agent-writer:")[0]!;

    expect(proxySection).toContain('"3000:9090"');
  });

  it("proxy has no port mapping when proxyPort is not set", () => {
    const yml = generateAcpComposeYml(defaultOpts);
    const proxySection = yml.split("agent-writer:")[0]!;

    expect(proxySection).not.toContain("ports:");
  });

  it("agent has MCP_PROXY_TOKEN and MCP_PROXY_URL", () => {
    const yml = generateAcpComposeYml(defaultOpts);
    const agentSection = yml.split("agent-writer:")[1]!;

    expect(agentSection).toContain("MCP_PROXY_TOKEN=test-proxy-token");
    expect(agentSection).toContain("MCP_PROXY_URL=http://proxy-writer:9090");
  });

  it("agent depends on proxy", () => {
    const yml = generateAcpComposeYml(defaultOpts);
    const agentSection = yml.split("agent-writer:")[1]!;

    expect(agentSection).toContain("depends_on:");
    expect(agentSection).toContain("- proxy-writer");
  });

  it("uses correct Dockerfile paths for project-local layout", () => {
    const yml = generateAcpComposeYml(defaultOpts);

    // Proxy: context is dockerDir, dockerfile is relative path to mcp-proxy/Dockerfile
    expect(yml).toContain(`context: "${defaultOpts.dockerDir}"`);
    expect(yml).toContain('dockerfile: "writer/mcp-proxy/Dockerfile"');

    // Agent: context is dockerDir, dockerfile is relative path
    expect(yml).toContain(`context: "${defaultOpts.dockerDir}"`);
    expect(yml).toContain('dockerfile: "writer/note-taker/Dockerfile"');
  });

  it("includes acpClient in proxy env when provided", () => {
    const yml = generateAcpComposeYml({ ...defaultOpts, acpClient: "zed" });
    const proxySection = yml.split("agent-writer:")[0]!;

    expect(proxySection).toContain("CHAPTER_ACP_CLIENT=zed");
  });

  it("includes acpCommand as command when provided", () => {
    const yml = generateAcpComposeYml({
      ...defaultOpts,
      acpCommand: ["mcp-agent", "--acp"],
    });
    const agentSection = yml.split("agent-writer:")[1]!;

    expect(agentSection).toContain("command:");
    expect(agentSection).toContain("mcp-agent");
  });

  it("has no command line when acpCommand is not provided", () => {
    const yml = generateAcpComposeYml(defaultOpts);
    const agentSection = yml.split("agent-writer:")[1]!;

    expect(agentSection).not.toContain("command:");
  });

  it("includes role mounts in agent service volumes", () => {
    const yml = generateAcpComposeYml({
      ...defaultOpts,
      roleMounts: [
        { source: "/data/shared", target: "/mnt/shared", readonly: false },
      ],
    });

    const agentSection = yml.split("agent-writer:")[1]!;
    expect(agentSection).toContain('"/data/shared:/mnt/shared"');
  });

  it("does not add role mounts to proxy volumes", () => {
    const yml = generateAcpComposeYml({
      ...defaultOpts,
      roleMounts: [
        { source: "/data/shared", target: "/mnt/shared", readonly: false },
      ],
    });

    const proxySection = yml.split("agent-writer:")[0]!;
    expect(proxySection).not.toContain("/mnt/shared");
  });

  it("appends :ro for readonly role mounts", () => {
    const yml = generateAcpComposeYml({
      ...defaultOpts,
      roleMounts: [
        { source: "/configs", target: "/etc/app", readonly: true },
      ],
    });

    const agentSection = yml.split("agent-writer:")[1]!;
    expect(agentSection).toContain('"/configs:/etc/app:ro"');
  });
});

// ── AcpSession ────────────────────────────────────────────────────────

describe("AcpSession", () => {
  let tmpDir: string;
  let projectDir: string;
  let dockerBuildDir: string;
  let dockerDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-acp-session-test-"));
    const setup = setupProjectDir(tmpDir);
    projectDir = setup.projectDir;
    dockerBuildDir = setup.dockerBuildDir;
    dockerDir = setup.dockerDir;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeConfig(overrides?: Partial<AcpSessionConfig>): AcpSessionConfig {
    return {
      projectDir,
      agent: "note-taker",
      role: "writer",
      dockerBuildDir,
      dockerDir,
      ...overrides,
    };
  }

  // ── Legacy start() ──────────────────────────────────────────────────

  it("start() returns correct SessionInfo", async () => {
    const { deps } = makeMockDeps({ sessionId: "sess0001" });
    const session = new AcpSession(makeConfig(), deps);

    const info = await session.start();

    expect(info.sessionId).toBe("sess0001");
    expect(info.proxyServiceName).toBe("proxy-writer");
    expect(info.agentServiceName).toBe("agent-writer");
    expect(info.composeFile).toContain("sess0001");
    expect(info.sessionDir).toContain("sess0001");
  });

  it("start() creates session directory and compose file", async () => {
    const { deps } = makeMockDeps({ sessionId: "dir00001" });
    const session = new AcpSession(makeConfig(), deps);

    const info = await session.start();

    expect(fs.existsSync(info.sessionDir)).toBe(true);
    expect(fs.existsSync(info.composeFile)).toBe(true);

    const content = fs.readFileSync(info.composeFile, "utf-8");
    expect(content).toContain("proxy-writer:");
    expect(content).toContain("agent-writer:");
    expect(content).not.toContain("credential-service:");
  });

  it("start() starts all services with --profile agent up -d", async () => {
    const { calls, deps } = makeMockDeps();
    const session = new AcpSession(makeConfig(), deps);

    await session.start();

    expect(calls).toHaveLength(1);
    expect(calls[0]!.args).toContain("--profile");
    expect(calls[0]!.args).toContain("agent");
    expect(calls[0]!.args).toContain("up");
    expect(calls[0]!.args).toContain("-d");
  });

  it("start() compose has NO port exposure for agent", async () => {
    const { deps } = makeMockDeps({ sessionId: "port0001" });
    const session = new AcpSession(makeConfig(), deps);

    const info = await session.start();

    const content = fs.readFileSync(info.composeFile, "utf-8");
    const agentSection = content.split("agent-writer:")[1]!;
    expect(agentSection).not.toContain("ports:");
    expect(agentSection).not.toContain("3002");
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

  it("stop() calls docker compose down for legacy session", async () => {
    const { calls, deps } = makeMockDeps();
    const session = new AcpSession(makeConfig(), deps);

    await session.start();
    await session.stop();

    expect(calls).toHaveLength(2);
    expect(calls[1]!.args).toContain("down");
    expect(calls[1]!.args).toContain("--profile");
    expect(calls[1]!.args).toContain("agent");
  });

  it("stop() is idempotent when not running", async () => {
    const { calls, deps } = makeMockDeps();
    const session = new AcpSession(makeConfig(), deps);

    await session.stop();

    expect(calls).toHaveLength(0);
  });

  it("stop() is idempotent after already stopped", async () => {
    const { calls, deps } = makeMockDeps();
    const session = new AcpSession(makeConfig(), deps);

    await session.start();
    await session.stop();
    await session.stop();

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

  it("creates session-scoped logs directory", async () => {
    const { deps } = makeMockDeps({ sessionId: "logs0001" });
    const session = new AcpSession(makeConfig(), deps);

    const info = await session.start();

    const logsDir = path.join(info.sessionDir, "logs");
    expect(fs.existsSync(logsDir)).toBe(true);
  });

  it("agent service has no stdin_open or tty in generated compose", async () => {
    const { deps } = makeMockDeps({ sessionId: "notty001" });
    const session = new AcpSession(makeConfig(), deps);

    const info = await session.start();

    const content = fs.readFileSync(info.composeFile, "utf-8");
    const agentSection = content.split("agent-writer:")[1]!;
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
      expect(info.agentServiceName).toBe("agent-writer");
      expect(info.proxyToken).toBeDefined();
      expect(info.credentialProxyToken).toBeDefined();
      expect(info.dockerBuildDir).toBeDefined();
      expect(info.composeFile).toContain("infra001");
    });

    it("startInfrastructure() creates compose with proxy and agent (agent behind profile)", async () => {
      const { deps } = makeMockDeps({ sessionId: "infra002" });
      const session = new AcpSession(makeConfig(), deps);

      const info = await session.startInfrastructure();

      const content = fs.readFileSync(info.composeFile, "utf-8");
      expect(content).toContain("proxy-writer:");
      expect(content).toContain("agent-writer:");
      expect(content).not.toContain("credential-service:");
      // Agent should be behind a profile
      const agentSection = content.split("agent-writer:")[1]!;
      expect(agentSection).toContain("profiles:");
      expect(agentSection).toContain("- agent");
    });

    it("startInfrastructure() calls compose up -d (without --profile, so agent is skipped)", async () => {
      const { calls, deps } = makeMockDeps();
      const session = new AcpSession(makeConfig(), deps);

      await session.startInfrastructure();

      expect(calls).toHaveLength(1);
      expect(calls[0]!.args).toEqual(["up", "-d"]);
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

    it("startAgent() uses docker compose run with project-local mount path", async () => {
      const { calls, deps } = makeMockDeps({ sessionId: "infra003" });
      const session = new AcpSession(makeConfig(), deps);

      await session.startInfrastructure();

      const agentDir = path.join(tmpDir, "target-project");
      fs.mkdirSync(agentDir, { recursive: true });

      const info = await session.startAgent(agentDir);

      expect(info.agentServiceName).toBe("agent-writer");
      expect(info.projectDir).toBe(agentDir);

      // Should have 2 calls: infra up, agent run
      expect(calls).toHaveLength(2);
      expect(calls[1]!.args).toEqual([
        "run", "-d", "--rm", "--build", "-v", `${agentDir}:/home/mason/workspace/project`, "agent-writer",
      ]);
      // Verify --service-ports is NOT present
      expect(calls[1]!.args).not.toContain("--service-ports");
    });

    it("startAgent() uses the same compose file as infrastructure", async () => {
      const { deps } = makeMockDeps({ sessionId: "infra004" });
      const session = new AcpSession(makeConfig(), deps);

      const infraInfo = await session.startInfrastructure();

      const agentDir = path.join(tmpDir, "target-project");
      fs.mkdirSync(agentDir, { recursive: true });

      const agentInfo = await session.startAgent(agentDir);

      expect(agentInfo.composeFile).toBe(infraInfo.composeFile);
    });

    it("startAgent() throws when infrastructure is not running", async () => {
      const { deps } = makeMockDeps();
      const session = new AcpSession(makeConfig(), deps);

      await expect(session.startAgent("/some/dir")).rejects.toThrow("Infrastructure must be running");
    });

    it("startAgent() throws when agent is already running", async () => {
      const { deps } = makeMockDeps({ sessionId: "infra005" });
      const session = new AcpSession(makeConfig(), deps);

      await session.startInfrastructure();

      const agentDir = path.join(tmpDir, "target-project");
      fs.mkdirSync(agentDir, { recursive: true });

      await session.startAgent(agentDir);

      await expect(session.startAgent(agentDir)).rejects.toThrow("Agent is already running");
    });

    it("stopAgent() stops and removes only the agent service", async () => {
      const { calls: composeCalls, deps } = makeMockDeps({ sessionId: "infra006" });
      const session = new AcpSession(makeConfig(), deps);

      await session.startInfrastructure();

      const agentDir = path.join(tmpDir, "target-project");
      fs.mkdirSync(agentDir, { recursive: true });

      await session.startAgent(agentDir);
      await session.stopAgent();

      // 4 calls: infra up, agent run, agent stop, agent rm -f
      expect(composeCalls).toHaveLength(4);
      expect(composeCalls[2]!.args).toContain("stop");
      expect(composeCalls[2]!.args).toContain("agent-writer");
      expect(composeCalls[3]!.args).toContain("rm");
      expect(composeCalls[3]!.args).toContain("-f");
      expect(composeCalls[3]!.args).toContain("agent-writer");

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

    it("stop() tears down everything with --profile agent down", async () => {
      const { calls, deps } = makeMockDeps({ sessionId: "infra007" });
      const session = new AcpSession(makeConfig(), deps);

      await session.startInfrastructure();

      const agentDir = path.join(tmpDir, "target-project");
      fs.mkdirSync(agentDir, { recursive: true });

      await session.startAgent(agentDir);
      await session.stop();

      // 3 calls: infra up, agent run, --profile agent down
      expect(calls).toHaveLength(3);
      expect(calls[2]!.args).toEqual(["--profile", "agent", "down"]);

      expect(session.isInfrastructureRunning()).toBe(false);
      expect(session.isAgentRunning()).toBe(false);
    });

    it("can start a new agent after stopAgent()", async () => {
      const { deps } = makeMockDeps({ sessionId: "infra008" });
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
      const { deps } = makeMockDeps({ sessionId: "infra009" });
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

  // ── startAgentProcess ─────────────────────────────────────────────────

  describe("startAgentProcess", () => {
    it("pre-builds image then spawns docker compose run without -d", async () => {
      const { calls, spawnCalls, mockChild, deps } = makeMockDepsWithSpawn({ sessionId: "proc001" });
      const session = new AcpSession(makeConfig(), deps);

      await session.startInfrastructure();

      const agentDir = path.join(tmpDir, "target-project");
      fs.mkdirSync(agentDir, { recursive: true });

      const result = await session.startAgentProcess(agentDir);

      expect(result.child).toBe(mockChild);
      expect(result.agentInfo.agentServiceName).toBe("agent-writer");
      expect(result.agentInfo.projectDir).toBe(agentDir);

      // Verify pre-build was called via execComposeFn
      // calls[0] = infra up, calls[1] = agent build
      expect(calls).toHaveLength(2);
      expect(calls[1]!.args).toEqual(["build", "agent-writer"]);

      // Verify spawn was called with correct args (no --build)
      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0]!.command).toBe("docker");
      expect(spawnCalls[0]!.args).toContain("compose");
      expect(spawnCalls[0]!.args).toContain("run");
      expect(spawnCalls[0]!.args).toContain("--rm");
      expect(spawnCalls[0]!.args).not.toContain("--build");
      expect(spawnCalls[0]!.args).toContain("agent-writer");
      expect(spawnCalls[0]!.args).toContain("-v");
      expect(spawnCalls[0]!.args).toContain(`${agentDir}:/home/mason/workspace/project`);

      // Verify NO -d flag (foreground process)
      expect(spawnCalls[0]!.args).not.toContain("-d");

      // Verify stdio is piped
      expect(spawnCalls[0]!.options.stdio).toEqual(["pipe", "pipe", "pipe"]);
    });

    it("includes compose file via -f flag", async () => {
      const { spawnCalls, deps } = makeMockDepsWithSpawn({ sessionId: "proc002" });
      const session = new AcpSession(makeConfig(), deps);

      const infraInfo = await session.startInfrastructure();

      const agentDir = path.join(tmpDir, "target-project");
      fs.mkdirSync(agentDir, { recursive: true });

      await session.startAgentProcess(agentDir);

      expect(spawnCalls[0]!.args).toContain("-f");
      expect(spawnCalls[0]!.args).toContain(infraInfo.composeFile);
    });

    it("throws when infrastructure is not running", async () => {
      const { deps } = makeMockDepsWithSpawn();
      const session = new AcpSession(makeConfig(), deps);

      await expect(session.startAgentProcess("/some/dir")).rejects.toThrow("Infrastructure must be running");
    });

    it("throws when agent is already running", async () => {
      const { deps } = makeMockDepsWithSpawn({ sessionId: "proc003" });
      const session = new AcpSession(makeConfig(), deps);

      await session.startInfrastructure();

      const agentDir = path.join(tmpDir, "target-project");
      fs.mkdirSync(agentDir, { recursive: true });

      await session.startAgentProcess(agentDir);

      await expect(session.startAgentProcess(agentDir)).rejects.toThrow("Agent is already running");
    });

    it("marks agent as running after startAgentProcess", async () => {
      const { deps } = makeMockDepsWithSpawn({ sessionId: "proc004" });
      const session = new AcpSession(makeConfig(), deps);

      await session.startInfrastructure();

      const agentDir = path.join(tmpDir, "target-project");
      fs.mkdirSync(agentDir, { recursive: true });

      expect(session.isAgentRunning()).toBe(false);
      await session.startAgentProcess(agentDir);
      expect(session.isAgentRunning()).toBe(true);
    });
  });

  // ── stopAgent with child process ──────────────────────────────────────

  describe("stopAgent with child process", () => {
    it("kills the child process instead of calling compose stop/rm", async () => {
      const { calls, mockChild, deps } = makeMockDepsWithSpawn({ sessionId: "kill001" });
      const session = new AcpSession(makeConfig(), deps);

      await session.startInfrastructure();

      const agentDir = path.join(tmpDir, "target-project");
      fs.mkdirSync(agentDir, { recursive: true });

      await session.startAgentProcess(agentDir);
      await session.stopAgent();

      // child.kill() should have been called
      expect(mockChild.kill).toHaveBeenCalledOnce();

      // Compose calls: infra up + agent build (no compose stop/rm for child process)
      expect(calls).toHaveLength(2);

      expect(session.isAgentRunning()).toBe(false);
    });

    it("can start a new agent process after stopAgent()", async () => {
      const { deps } = makeMockDepsWithSpawn({ sessionId: "kill002" });
      const session = new AcpSession(makeConfig(), deps);

      await session.startInfrastructure();

      const dir1 = path.join(tmpDir, "project-1");
      fs.mkdirSync(dir1, { recursive: true });
      await session.startAgentProcess(dir1);
      await session.stopAgent();

      const dir2 = path.join(tmpDir, "project-2");
      fs.mkdirSync(dir2, { recursive: true });
      const result = await session.startAgentProcess(dir2);

      expect(result.agentInfo.projectDir).toBe(dir2);
      expect(session.isAgentRunning()).toBe(true);
    });

    it("stop() kills child process and tears down infrastructure", async () => {
      const { calls, mockChild, deps } = makeMockDepsWithSpawn({ sessionId: "kill003" });
      const session = new AcpSession(makeConfig(), deps);

      await session.startInfrastructure();

      const agentDir = path.join(tmpDir, "target-project");
      fs.mkdirSync(agentDir, { recursive: true });

      await session.startAgentProcess(agentDir);
      await session.stop();

      // child.kill() called
      expect(mockChild.kill).toHaveBeenCalledOnce();

      // compose calls: infra up + agent build + down
      expect(calls).toHaveLength(3);
      expect(calls[1]!.args).toEqual(["build", "agent-writer"]);
      expect(calls[2]!.args).toEqual(["--profile", "agent", "down"]);

      expect(session.isInfrastructureRunning()).toBe(false);
      expect(session.isAgentRunning()).toBe(false);
    });
  });
});
