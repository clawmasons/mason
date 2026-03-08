import { type MockInstance, describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { program } from "../../src/cli/index.js";
import { runEnable } from "../../src/cli/commands/enable.js";
import { addAgent, readAgentsRegistry } from "../../src/registry/members.js";
import type { AgentEntry } from "../../src/registry/types.js";

describe("CLI enable command", () => {
  it("has the enable command registered", () => {
    const enableCmd = program.commands.find((cmd) => cmd.name() === "enable");
    expect(enableCmd).toBeDefined();
    if (enableCmd) {
      expect(enableCmd.description()).toContain("Enable");
    }
  });

  it("enable command accepts a member argument", () => {
    const enableCmd = program.commands.find((cmd) => cmd.name() === "enable");
    expect(enableCmd).toBeDefined();
    if (enableCmd) {
      const args = enableCmd.registeredArguments;
      expect(args).toHaveLength(1);
      expect(args[0].name()).toBe("agent");
      expect(args[0].required).toBe(true);
    }
  });
});

describe("runEnable", () => {
  let tmpDir: string;
  let chapterDir: string;
  let exitSpy: MockInstance;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  const agentEntry: AgentEntry = {
    package: "@test/agent-ops",
        status: "enabled",
    installedAt: "2026-03-06T10:30:00.000Z",
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-enable-test-"));
    chapterDir = path.join(tmpDir, ".chapter");
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("enables a disabled member", () => {
    addAgent(chapterDir, "ops", { ...agentEntry, status: "disabled" });

    runEnable(tmpDir, "@ops");

    const registry = readAgentsRegistry(chapterDir);
    expect(registry.agents.ops.status).toBe("enabled");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("keeps an already enabled member as enabled", () => {
    addAgent(chapterDir, "ops", agentEntry);

    runEnable(tmpDir, "@ops");

    const registry = readAgentsRegistry(chapterDir);
    expect(registry.agents.ops.status).toBe("enabled");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("strips @ prefix from member argument", () => {
    addAgent(chapterDir, "note-taker", { ...agentEntry, package: "@test/agent-note-taker", status: "disabled" });

    runEnable(tmpDir, "@note-taker");

    const registry = readAgentsRegistry(chapterDir);
    expect(registry.agents["note-taker"].status).toBe("enabled");
  });

  it("works without @ prefix", () => {
    addAgent(chapterDir, "ops", { ...agentEntry, status: "disabled" });

    runEnable(tmpDir, "ops");

    const registry = readAgentsRegistry(chapterDir);
    expect(registry.agents.ops.status).toBe("enabled");
  });

  it("prints success message with member slug", () => {
    addAgent(chapterDir, "ops", { ...agentEntry, status: "disabled" });

    runEnable(tmpDir, "@ops");

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("@ops");
    expect(logOutput).toContain("enabled");
  });

  it("exits 1 when member is not installed", () => {
    // No member in registry
    runEnable(tmpDir, "@nonexistent");

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("not found");
  });

  it("preserves other member fields when enabling", () => {
    addAgent(chapterDir, "ops", { ...agentEntry, status: "disabled" });

    runEnable(tmpDir, "@ops");

    const registry = readAgentsRegistry(chapterDir);
    expect(registry.agents.ops.package).toBe(agentEntry.package);
    
    expect(registry.agents.ops.installedAt).toBe(agentEntry.installedAt);
  });
});
