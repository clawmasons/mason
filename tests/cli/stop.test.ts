import { type MockInstance, describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { program } from "../../src/cli/index.js";
import { stopAgent } from "../../src/cli/commands/stop.js";

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

describe("CLI stop command", () => {
  it("has the stop command registered", () => {
    const stopCmd = program.commands.find((cmd) => cmd.name() === "stop");
    expect(stopCmd).toBeDefined();
    if (stopCmd) {
      expect(stopCmd.description()).toContain("Stop");
    }
  });

  it("stop command accepts a member argument", () => {
    const stopCmd = program.commands.find((cmd) => cmd.name() === "stop");
    expect(stopCmd).toBeDefined();
    if (stopCmd) {
      const args = stopCmd.registeredArguments;
      expect(args).toHaveLength(1);
      expect(args[0].name()).toBe("agent");
      expect(args[0].required).toBe(true);
    }
  });

  it("stop command has --output-dir option", () => {
    const stopCmd = program.commands.find((cmd) => cmd.name() === "stop");
    expect(stopCmd).toBeDefined();
    if (stopCmd) {
      const outputOpt = stopCmd.options.find((opt) => opt.long === "--output-dir");
      expect(outputOpt).toBeDefined();
    }
  });
});

describe("stopAgent", () => {
  let tmpDir: string;
  let exitSpy: MockInstance;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-stop-test-"));
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function setupMemberDir(): string {
    const memberDir = path.join(tmpDir, ".chapter", "agents", "ops");
    fs.mkdirSync(memberDir, { recursive: true });
    fs.writeFileSync(
      path.join(memberDir, "docker-compose.yml"),
      `version: "3.8"\nservices:\n  mcp-proxy:\n    image: proxy\n`,
    );
    return memberDir;
  }

  it("exits 1 when member directory does not exist", async () => {
    await stopAgent(tmpDir, "@test/agent-ops", {});
    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("not found");
  });

  it("succeeds with valid member directory", async () => {
    setupMemberDir();
    await stopAgent(tmpDir, "@test/agent-ops", {});
    expect(exitSpy).not.toHaveBeenCalledWith(1);
    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("stopped");
  });

  it("exits 1 when docker-compose.yml is missing", async () => {
    const memberDir = path.join(tmpDir, ".chapter", "agents", "ops");
    fs.mkdirSync(memberDir, { recursive: true });
    // No docker-compose.yml created

    await stopAgent(tmpDir, "@test/agent-ops", {});
    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("docker-compose.yml");
  });
});
