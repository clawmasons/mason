import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { program } from "../../src/cli/index.js";
import { runAgent } from "../../src/cli/commands/run.js";

// Mock docker-utils to avoid real docker compose checks
vi.mock("../../src/cli/commands/docker-utils.js", async () => {
  const actual = await vi.importActual("../../src/cli/commands/docker-utils.js");
  return {
    ...actual,
    checkDockerCompose: vi.fn(), // no-op by default
  };
});

// Mock child_process.spawn to avoid real docker calls
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
  spawn: vi.fn(() => {
    const events: Record<string, (...args: unknown[]) => void> = {};
    const mock = {
      on: (event: string, cb: (...args: unknown[]) => void) => {
        events[event] = cb;
        // Auto-resolve "close" with 0
        if (event === "close") {
          setTimeout(() => cb(0), 0);
        }
        return mock;
      },
      stdout: null,
      stderr: null,
    };
    return mock;
  }),
}));

describe("CLI run command", () => {
  it("has the run command registered", () => {
    const runCmd = program.commands.find((cmd) => cmd.name() === "run");
    expect(runCmd).toBeDefined();
    if (runCmd) {
      expect(runCmd.description()).toContain("Start");
    }
  });

  it("run command accepts an agent argument", () => {
    const runCmd = program.commands.find((cmd) => cmd.name() === "run");
    expect(runCmd).toBeDefined();
    if (runCmd) {
      const args = runCmd.registeredArguments;
      expect(args).toHaveLength(1);
      expect(args[0].name()).toBe("agent");
      expect(args[0].required).toBe(true);
    }
  });

  it("run command has --runtime and --output-dir options", () => {
    const runCmd = program.commands.find((cmd) => cmd.name() === "run");
    expect(runCmd).toBeDefined();
    if (runCmd) {
      const runtimeOpt = runCmd.options.find((opt) => opt.long === "--runtime");
      expect(runtimeOpt).toBeDefined();
      const outputOpt = runCmd.options.find((opt) => opt.long === "--output-dir");
      expect(outputOpt).toBeDefined();
    }
  });
});

describe("runAgent", () => {
  let tmpDir: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pam-run-test-"));
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function setupAgentDir(envContent: string): string {
    const agentDir = path.join(tmpDir, ".pam", "agents", "ops");
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentDir, "docker-compose.yml"),
      `version: "3.8"\nservices:\n  mcp-proxy:\n    image: proxy\n  claude-code:\n    build: ./claude-code\n`,
    );
    fs.writeFileSync(path.join(agentDir, ".env"), envContent);
    return agentDir;
  }

  it("exits 1 when docker-compose.yml is missing", async () => {
    const agentDir = path.join(tmpDir, ".pam", "agents", "ops");
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(path.join(agentDir, ".env"), "TOKEN=abc\n");
    // No docker-compose.yml

    await runAgent(tmpDir, "@test/agent-ops", {});
    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("docker-compose.yml");
  });

  it("exits 1 when agent directory does not exist", async () => {
    await runAgent(tmpDir, "@test/agent-ops", {});
    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("not found");
  });

  it("exits 1 when .env has missing values", async () => {
    setupAgentDir("GITHUB_TOKEN=\nPAM_PROXY_TOKEN=abc\n");
    await runAgent(tmpDir, "@test/agent-ops", {});
    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("GITHUB_TOKEN");
  });

  it("succeeds with valid configuration", async () => {
    setupAgentDir("GITHUB_TOKEN=abc123\nPAM_PROXY_TOKEN=xyz\n");
    await runAgent(tmpDir, "@test/agent-ops", {});
    expect(exitSpy).not.toHaveBeenCalledWith(1);
    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("running");
  });

  it("exits 1 when runtime not found in compose file", async () => {
    setupAgentDir("GITHUB_TOKEN=abc\nPAM_PROXY_TOKEN=xyz\n");
    await runAgent(tmpDir, "@test/agent-ops", { runtime: "unknown-runtime" });
    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("not found");
  });

  it("accepts valid runtime from compose file", async () => {
    setupAgentDir("GITHUB_TOKEN=abc\nPAM_PROXY_TOKEN=xyz\n");
    await runAgent(tmpDir, "@test/agent-ops", { runtime: "claude-code" });
    expect(exitSpy).not.toHaveBeenCalledWith(1);
  });

  it("uses custom output-dir when provided", async () => {
    const customDir = path.join(tmpDir, "custom");
    fs.mkdirSync(customDir, { recursive: true });
    fs.writeFileSync(
      path.join(customDir, "docker-compose.yml"),
      `version: "3.8"\nservices:\n  mcp-proxy:\n    image: proxy\n`,
    );
    fs.writeFileSync(path.join(customDir, ".env"), "TOKEN=abc\n");

    await runAgent(tmpDir, "@test/agent-ops", { outputDir: customDir });
    expect(exitSpy).not.toHaveBeenCalledWith(1);
  });
});
