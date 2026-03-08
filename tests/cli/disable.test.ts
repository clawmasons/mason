import { type MockInstance, describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { program } from "../../src/cli/index.js";
import { runDisable } from "../../src/cli/commands/disable.js";
import { addAgent, readAgentsRegistry } from "../../src/registry/members.js";
import type { AgentEntry } from "../../src/registry/types.js";

describe("CLI disable command", () => {
  it("has the disable command registered", () => {
    const disableCmd = program.commands.find((cmd) => cmd.name() === "disable");
    expect(disableCmd).toBeDefined();
    if (disableCmd) {
      expect(disableCmd.description()).toContain("Disable");
    }
  });

  it("disable command accepts a member argument", () => {
    const disableCmd = program.commands.find((cmd) => cmd.name() === "disable");
    expect(disableCmd).toBeDefined();
    if (disableCmd) {
      const args = disableCmd.registeredArguments;
      expect(args).toHaveLength(1);
      expect(args[0].name()).toBe("agent");
      expect(args[0].required).toBe(true);
    }
  });
});

describe("runDisable", () => {
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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-disable-test-"));
    chapterDir = path.join(tmpDir, ".chapter");
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("disables an enabled member", () => {
    addAgent(chapterDir, "ops", agentEntry);

    runDisable(tmpDir, "@ops");

    const registry = readAgentsRegistry(chapterDir);
    expect(registry.agents.ops.status).toBe("disabled");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("keeps an already disabled member as disabled", () => {
    addAgent(chapterDir, "ops", { ...agentEntry, status: "disabled" });

    runDisable(tmpDir, "@ops");

    const registry = readAgentsRegistry(chapterDir);
    expect(registry.agents.ops.status).toBe("disabled");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("strips @ prefix from member argument", () => {
    addAgent(chapterDir, "note-taker", { ...agentEntry, package: "@test/agent-note-taker" });

    runDisable(tmpDir, "@note-taker");

    const registry = readAgentsRegistry(chapterDir);
    expect(registry.agents["note-taker"].status).toBe("disabled");
  });

  it("works without @ prefix", () => {
    addAgent(chapterDir, "ops", agentEntry);

    runDisable(tmpDir, "ops");

    const registry = readAgentsRegistry(chapterDir);
    expect(registry.agents.ops.status).toBe("disabled");
  });

  it("prints success message with member slug", () => {
    addAgent(chapterDir, "ops", agentEntry);

    runDisable(tmpDir, "@ops");

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("@ops");
    expect(logOutput).toContain("disabled");
  });

  it("exits 1 when member is not installed", () => {
    // No member in registry
    runDisable(tmpDir, "@nonexistent");

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("not found");
  });

  it("preserves other member fields when disabling", () => {
    addAgent(chapterDir, "ops", agentEntry);

    runDisable(tmpDir, "@ops");

    const registry = readAgentsRegistry(chapterDir);
    expect(registry.agents.ops.package).toBe(agentEntry.package);
    
    expect(registry.agents.ops.installedAt).toBe(agentEntry.installedAt);
  });
});
