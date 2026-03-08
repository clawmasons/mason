import { type MockInstance, describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { program } from "../../src/cli/index.js";
import {
  generateSessionId,
  readRunConfig,
  validateDockerfiles,
  generateComposeYml,
  runAgent,
} from "../../src/cli/commands/run-agent.js";
import type { RunConfig } from "../../src/cli/commands/run-init.js";

// ── Command Registration ────────────────────────────────────────────────

describe("CLI run-agent command", () => {
  it("has the run-agent command registered", () => {
    const cmd = program.commands.find((c) => c.name() === "run-agent");
    expect(cmd).toBeDefined();
    if (cmd) {
      expect(cmd.description()).toContain("Run a chapter agent");
    }
  });
});

// ── generateSessionId ───────────────────────────────────────────────────

describe("generateSessionId", () => {
  it("returns an 8-character hex string", () => {
    const id = generateSessionId();
    expect(id).toMatch(/^[0-9a-f]{8}$/);
  });

  it("generates unique IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateSessionId());
    }
    // With 4 bytes of randomness, 100 IDs should all be unique
    expect(ids.size).toBe(100);
  });
});

// ── readRunConfig ───────────────────────────────────────────────────────

describe("readRunConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-run-agent-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeConfig(config: Record<string, unknown>): void {
    const configDir = path.join(tmpDir, ".clawmasons");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "chapter.json"),
      JSON.stringify(config),
    );
  }

  it("reads valid config", () => {
    writeConfig({
      chapter: "acme.platform",
      "docker-registries": ["local"],
      "docker-build": "/path/to/docker",
    });
    const config = readRunConfig(tmpDir);
    expect(config.chapter).toBe("acme.platform");
    expect(config["docker-build"]).toBe("/path/to/docker");
  });

  it("throws when .clawmasons/chapter.json is missing", () => {
    expect(() => readRunConfig(tmpDir)).toThrow("run-init");
  });

  it("throws when chapter.json is not valid JSON", () => {
    const configDir = path.join(tmpDir, ".clawmasons");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "chapter.json"), "not json");
    expect(() => readRunConfig(tmpDir)).toThrow("not valid JSON");
  });

  it("throws when chapter field is missing", () => {
    writeConfig({ "docker-build": "/path" });
    expect(() => readRunConfig(tmpDir)).toThrow("chapter");
  });

  it("throws when docker-build field is missing", () => {
    writeConfig({ chapter: "acme.platform" });
    expect(() => readRunConfig(tmpDir)).toThrow("docker-build");
  });
});

// ── validateDockerfiles ─────────────────────────────────────────────────

describe("validateDockerfiles", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-run-agent-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function setupDockerfiles(agent: string, role: string): void {
    const proxyDir = path.join(tmpDir, "proxy", role);
    const agentDir = path.join(tmpDir, "agent", agent, role);
    fs.mkdirSync(proxyDir, { recursive: true });
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(path.join(proxyDir, "Dockerfile"), "FROM node:20\n");
    fs.writeFileSync(path.join(agentDir, "Dockerfile"), "FROM node:20\n");
  }

  it("returns paths when both Dockerfiles exist", () => {
    setupDockerfiles("note-taker", "writer");
    const result = validateDockerfiles(tmpDir, "note-taker", "writer");
    expect(result.proxyDockerfile).toContain("proxy/writer/Dockerfile");
    expect(result.agentDockerfile).toContain("agent/note-taker/writer/Dockerfile");
  });

  it("throws when proxy Dockerfile is missing", () => {
    const agentDir = path.join(tmpDir, "agent", "note-taker", "writer");
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(path.join(agentDir, "Dockerfile"), "FROM node:20\n");

    expect(() => validateDockerfiles(tmpDir, "note-taker", "writer")).toThrow(
      "Proxy Dockerfile not found",
    );
  });

  it("throws when agent Dockerfile is missing", () => {
    const proxyDir = path.join(tmpDir, "proxy", "writer");
    fs.mkdirSync(proxyDir, { recursive: true });
    fs.writeFileSync(path.join(proxyDir, "Dockerfile"), "FROM node:20\n");

    expect(() => validateDockerfiles(tmpDir, "note-taker", "writer")).toThrow(
      "Agent Dockerfile not found",
    );
  });
});

// ── generateComposeYml ──────────────────────────────────────────────────

describe("generateComposeYml", () => {
  it("generates valid compose YAML with correct service names", () => {
    const yml = generateComposeYml({
      dockerBuildPath: "/chapters/acme/docker",
      projectDir: "/projects/my-project",
      agent: "note-taker",
      role: "writer",
      logsDir: "/projects/my-project/.clawmasons/logs",
    });

    // Service names
    expect(yml).toContain("proxy-writer:");
    expect(yml).toContain("agent-note-taker-writer:");

    // Build contexts
    expect(yml).toContain('context: "/chapters/acme/docker"');
    expect(yml).toContain('dockerfile: "proxy/writer/Dockerfile"');
    expect(yml).toContain('dockerfile: "agent/note-taker/writer/Dockerfile"');

    // Volumes
    expect(yml).toContain('"/projects/my-project:/workspace"');
    expect(yml).toContain('"/projects/my-project/.clawmasons/logs:/logs"');

    // Agent depends on proxy
    expect(yml).toContain("depends_on:");
    expect(yml).toContain("- proxy-writer");

    // Agent is interactive
    expect(yml).toContain("stdin_open: true");
    expect(yml).toContain("tty: true");
  });

  it("uses correct Dockerfile paths for different agent/role combos", () => {
    const yml = generateComposeYml({
      dockerBuildPath: "/docker",
      projectDir: "/proj",
      agent: "coder",
      role: "reviewer",
      logsDir: "/proj/.clawmasons/logs",
    });

    expect(yml).toContain("proxy-reviewer:");
    expect(yml).toContain("agent-coder-reviewer:");
    expect(yml).toContain('dockerfile: "proxy/reviewer/Dockerfile"');
    expect(yml).toContain('dockerfile: "agent/coder/reviewer/Dockerfile"');
  });
});

// ── runAgent (integration) ──────────────────────────────────────────────

describe("runAgent", () => {
  let tmpDir: string;
  let projectDir: string;
  let dockerBuildPath: string;
  let exitSpy: MockInstance;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-run-agent-test-"));

    // Set up a mock chapter project with docker build directory
    dockerBuildPath = path.join(tmpDir, "chapter-project", "docker");

    // Create proxy and agent Dockerfiles
    fs.mkdirSync(path.join(dockerBuildPath, "proxy", "writer"), { recursive: true });
    fs.writeFileSync(
      path.join(dockerBuildPath, "proxy", "writer", "Dockerfile"),
      "FROM node:20\n",
    );
    fs.mkdirSync(path.join(dockerBuildPath, "agent", "note-taker", "writer"), { recursive: true });
    fs.writeFileSync(
      path.join(dockerBuildPath, "agent", "note-taker", "writer", "Dockerfile"),
      "FROM node:20\n",
    );

    // Set up the project directory with .clawmasons/chapter.json
    projectDir = path.join(tmpDir, "my-project");
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

    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeMockDeps(overrides?: {
    proxyExitCode?: number;
    agentExitCode?: number;
    downExitCode?: number;
    sessionId?: string;
  }) {
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
          // Determine which call this is based on args
          if (args.includes("-d")) {
            return overrides?.proxyExitCode ?? 0;
          }
          if (args.includes("down")) {
            return overrides?.downExitCode ?? 0;
          }
          // Agent up call
          return overrides?.agentExitCode ?? 0;
        },
      },
    };
  }

  it("creates session directory with docker-compose.yml", async () => {
    const { deps } = makeMockDeps({ sessionId: "sess0001" });

    await runAgent(projectDir, "note-taker", "writer", deps);

    const sessionDir = path.join(projectDir, ".clawmasons", "sessions", "sess0001", "docker");
    expect(fs.existsSync(sessionDir)).toBe(true);

    const composeFile = path.join(sessionDir, "docker-compose.yml");
    expect(fs.existsSync(composeFile)).toBe(true);

    const content = fs.readFileSync(composeFile, "utf-8");
    expect(content).toContain("proxy-writer:");
    expect(content).toContain("agent-note-taker-writer:");
  });

  it("generates unique session IDs per invocation", async () => {
    let callCount = 0;
    const ids = ["aaaa1111", "bbbb2222"];

    const baseDeps = {
      checkDockerComposeFn: () => {},
      execComposeFn: async () => 0,
    };

    await runAgent(projectDir, "note-taker", "writer", {
      ...baseDeps,
      generateSessionIdFn: () => ids[callCount++]!,
    });

    await runAgent(projectDir, "note-taker", "writer", {
      ...baseDeps,
      generateSessionIdFn: () => ids[callCount++]!,
    });

    const sessionsDir = path.join(projectDir, ".clawmasons", "sessions");
    const sessions = fs.readdirSync(sessionsDir);
    expect(sessions).toContain("aaaa1111");
    expect(sessions).toContain("bbbb2222");
  });

  it("starts proxy detached then agent interactively", async () => {
    const { calls, deps } = makeMockDeps();

    await runAgent(projectDir, "note-taker", "writer", deps);

    // First call: proxy up -d
    expect(calls[0]!.args).toContain("up");
    expect(calls[0]!.args).toContain("-d");
    expect(calls[0]!.args).toContain("proxy-writer");

    // Second call: agent up (interactive)
    expect(calls[1]!.args).toContain("up");
    expect(calls[1]!.args).toContain("agent-note-taker-writer");
    expect(calls[1]!.opts?.interactive).toBe(true);
  });

  it("tears down proxy after agent exits", async () => {
    const { calls, deps } = makeMockDeps();

    await runAgent(projectDir, "note-taker", "writer", deps);

    // Third call should be docker compose down
    expect(calls[2]!.args).toContain("down");
  });

  it("retains session directory after exit", async () => {
    const { deps } = makeMockDeps({ sessionId: "keep0001" });

    await runAgent(projectDir, "note-taker", "writer", deps);

    const sessionDir = path.join(projectDir, ".clawmasons", "sessions", "keep0001");
    expect(fs.existsSync(sessionDir)).toBe(true);
  });

  it("compose file references correct Dockerfiles from docker-build path", async () => {
    const { deps } = makeMockDeps({ sessionId: "ref00001" });

    await runAgent(projectDir, "note-taker", "writer", deps);

    const composeFile = path.join(
      projectDir, ".clawmasons", "sessions", "ref00001", "docker", "docker-compose.yml",
    );
    const content = fs.readFileSync(composeFile, "utf-8");

    expect(content).toContain(`context: "${dockerBuildPath}"`);
    expect(content).toContain('dockerfile: "proxy/writer/Dockerfile"');
    expect(content).toContain('dockerfile: "agent/note-taker/writer/Dockerfile"');
  });

  it("logs session info and completion message", async () => {
    const { deps } = makeMockDeps({ sessionId: "log00001" });

    await runAgent(projectDir, "note-taker", "writer", deps);

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("acme.platform");
    expect(logOutput).toContain("note-taker");
    expect(logOutput).toContain("writer");
    expect(logOutput).toContain("log00001");
    expect(logOutput).toContain("run-agent complete");
  });

  // ── Error Cases ──────────────────────────────────────────────────────

  it("exits 1 when .clawmasons/chapter.json is missing", async () => {
    const emptyProject = path.join(tmpDir, "empty-project");
    fs.mkdirSync(emptyProject, { recursive: true });

    await runAgent(emptyProject, "note-taker", "writer", {
      checkDockerComposeFn: () => {},
      execComposeFn: async () => 0,
    });

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("run-agent failed");
    expect(errorOutput).toContain("run-init");
  });

  it("exits 1 when docker compose is not available", async () => {
    await runAgent(projectDir, "note-taker", "writer", {
      checkDockerComposeFn: () => {
        throw new Error("Docker Compose v2 is required");
      },
      execComposeFn: async () => 0,
    });

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("run-agent failed");
    expect(errorOutput).toContain("Docker Compose");
  });

  it("exits 1 when proxy Dockerfile is missing", async () => {
    // Remove the proxy Dockerfile
    fs.rmSync(path.join(dockerBuildPath, "proxy"), { recursive: true });

    const { deps } = makeMockDeps();
    await runAgent(projectDir, "note-taker", "writer", deps);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("Proxy Dockerfile not found");
  });

  it("exits 1 when agent Dockerfile is missing", async () => {
    // Remove the agent Dockerfile
    fs.rmSync(path.join(dockerBuildPath, "agent"), { recursive: true });

    const { deps } = makeMockDeps();
    await runAgent(projectDir, "note-taker", "writer", deps);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("Agent Dockerfile not found");
  });

  it("exits 1 when proxy fails to start", async () => {
    const { deps } = makeMockDeps({ proxyExitCode: 1 });

    await runAgent(projectDir, "note-taker", "writer", deps);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("Failed to start proxy");
  });

  it("creates logs directory if it does not exist", async () => {
    const { deps } = makeMockDeps();

    await runAgent(projectDir, "note-taker", "writer", deps);

    const logsDir = path.join(projectDir, ".clawmasons", "logs");
    expect(fs.existsSync(logsDir)).toBe(true);
    expect(fs.statSync(logsDir).isDirectory()).toBe(true);
  });
});
