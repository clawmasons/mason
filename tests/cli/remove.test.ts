import { type MockInstance, describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { program } from "../../src/cli/index.js";
import { runRemove, findDependents } from "../../src/cli/commands/remove.js";
import { discoverPackages } from "../../src/resolver/discover.js";

// Mock child_process.execFileSync
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from "node:child_process";
const mockExecFileSync = vi.mocked(execFileSync);

describe("CLI remove command", () => {
  it("has the remove command registered", () => {
    const removeCmd = program.commands.find((cmd) => cmd.name() === "remove");
    expect(removeCmd).toBeDefined();
    if (removeCmd) {
      expect(removeCmd.description()).toContain("Remove");
    }
  });

  it("remove command accepts a pkg argument", () => {
    const removeCmd = program.commands.find((cmd) => cmd.name() === "remove");
    expect(removeCmd).toBeDefined();
    if (removeCmd) {
      const args = removeCmd.registeredArguments;
      expect(args.length).toBeGreaterThanOrEqual(1);
      expect(args[0].name()).toBe("pkg");
      expect(args[0].required).toBe(true);
    }
  });

  it("remove command has --force option", () => {
    const removeCmd = program.commands.find((cmd) => cmd.name() === "remove");
    expect(removeCmd).toBeDefined();
    if (removeCmd) {
      const forceOption = removeCmd.options.find((opt) => opt.long === "--force");
      expect(forceOption).toBeDefined();
    }
  });
});

describe("findDependents", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-remove-dep-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writePackage(dir: string, pkg: Record<string, unknown>): void {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2));
  }

  it("detects role permissions reference to an app", () => {
    writePackage(path.join(tmpDir, "apps", "github"), {
      name: "@test/app-github",
      version: "1.0.0",
      chapter: {
        type: "app",
        transport: "stdio",
        command: "npx",
        args: ["-y", "server"],
        tools: ["create_issue"],
        capabilities: ["tools"],
      },
    });

    writePackage(path.join(tmpDir, "roles", "manager"), {
      name: "@test/role-manager",
      version: "1.0.0",
      chapter: {
        type: "role",
        permissions: {
          "@test/app-github": { allow: ["create_issue"], deny: [] },
        },
      },
    });

    const packages = discoverPackages(tmpDir);
    const dependents = findDependents("@test/app-github", packages);
    expect(dependents).toHaveLength(1);
    expect(dependents[0].name).toBe("@test/role-manager");
  });

  it("detects role tasks reference", () => {
    writePackage(path.join(tmpDir, "tasks", "triage"), {
      name: "@test/task-triage",
      version: "1.0.0",
      chapter: { type: "task", taskType: "subagent" },
    });

    writePackage(path.join(tmpDir, "roles", "manager"), {
      name: "@test/role-manager",
      version: "1.0.0",
      chapter: {
        type: "role",
        tasks: ["@test/task-triage"],
        permissions: {},
      },
    });

    const packages = discoverPackages(tmpDir);
    const dependents = findDependents("@test/task-triage", packages);
    expect(dependents).toHaveLength(1);
    expect(dependents[0].name).toBe("@test/role-manager");
  });

  it("detects role skills reference", () => {
    writePackage(path.join(tmpDir, "skills", "labeling"), {
      name: "@test/skill-labeling",
      version: "1.0.0",
      chapter: { type: "skill", artifacts: ["./SKILL.md"], description: "Labeling" },
    });

    writePackage(path.join(tmpDir, "roles", "manager"), {
      name: "@test/role-manager",
      version: "1.0.0",
      chapter: {
        type: "role",
        skills: ["@test/skill-labeling"],
        permissions: {},
      },
    });

    const packages = discoverPackages(tmpDir);
    const dependents = findDependents("@test/skill-labeling", packages);
    expect(dependents).toHaveLength(1);
    expect(dependents[0].name).toBe("@test/role-manager");
  });

  it("detects task requires.apps reference", () => {
    writePackage(path.join(tmpDir, "apps", "github"), {
      name: "@test/app-github",
      version: "1.0.0",
      chapter: {
        type: "app",
        transport: "stdio",
        command: "npx",
        args: ["-y", "server"],
        tools: ["create_issue"],
        capabilities: ["tools"],
      },
    });

    writePackage(path.join(tmpDir, "tasks", "triage"), {
      name: "@test/task-triage",
      version: "1.0.0",
      chapter: {
        type: "task",
        taskType: "subagent",
        requires: { apps: ["@test/app-github"] },
      },
    });

    const packages = discoverPackages(tmpDir);
    const dependents = findDependents("@test/app-github", packages);
    expect(dependents).toHaveLength(1);
    expect(dependents[0].name).toBe("@test/task-triage");
  });

  it("detects task requires.skills reference", () => {
    writePackage(path.join(tmpDir, "skills", "labeling"), {
      name: "@test/skill-labeling",
      version: "1.0.0",
      chapter: { type: "skill", artifacts: ["./SKILL.md"], description: "Labeling" },
    });

    writePackage(path.join(tmpDir, "tasks", "triage"), {
      name: "@test/task-triage",
      version: "1.0.0",
      chapter: {
        type: "task",
        taskType: "subagent",
        requires: { skills: ["@test/skill-labeling"] },
      },
    });

    const packages = discoverPackages(tmpDir);
    const dependents = findDependents("@test/skill-labeling", packages);
    expect(dependents).toHaveLength(1);
    expect(dependents[0].name).toBe("@test/task-triage");
  });

  it("detects agent roles reference", () => {
    writePackage(path.join(tmpDir, "roles", "manager"), {
      name: "@test/role-manager",
      version: "1.0.0",
      chapter: { type: "role", permissions: {} },
    });

    writePackage(path.join(tmpDir, "agents", "ops"), {
      name: "@test/agent-ops",
      version: "1.0.0",
      chapter: {
        type: "agent",
        runtimes: ["claude-code"],
        roles: ["@test/role-manager"],
      },
    });

    const packages = discoverPackages(tmpDir);
    const dependents = findDependents("@test/role-manager", packages);
    expect(dependents).toHaveLength(1);
    expect(dependents[0].name).toBe("@test/agent-ops");
  });

  it("returns empty when no dependents exist", () => {
    writePackage(path.join(tmpDir, "apps", "github"), {
      name: "@test/app-github",
      version: "1.0.0",
      chapter: {
        type: "app",
        transport: "stdio",
        command: "npx",
        args: ["-y", "server"],
        tools: ["create_issue"],
        capabilities: ["tools"],
      },
    });

    const packages = discoverPackages(tmpDir);
    const dependents = findDependents("@test/app-github", packages);
    expect(dependents).toHaveLength(0);
  });
});

describe("runRemove", () => {
  let tmpDir: string;
  let exitSpy: MockInstance;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-remove-test-"));
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockExecFileSync.mockReset();
    mockExecFileSync.mockReturnValue(Buffer.from(""));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writePackage(dir: string, pkg: Record<string, unknown>): void {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2));
  }

  it("removes a package with no dependents", async () => {
    writePackage(path.join(tmpDir, "apps", "github"), {
      name: "@test/app-github",
      version: "1.0.0",
      chapter: {
        type: "app",
        transport: "stdio",
        command: "npx",
        args: ["-y", "server"],
        tools: ["create_issue"],
        capabilities: ["tools"],
      },
    });

    await runRemove(tmpDir, "@test/app-github", { force: false, npmArgs: [] });

    expect(exitSpy).not.toHaveBeenCalledWith(1);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("✔"));
    expect(mockExecFileSync).toHaveBeenCalledWith(
      "npm",
      ["uninstall", "@test/app-github"],
      expect.objectContaining({ cwd: tmpDir }),
    );
  });

  it("blocks removal when dependents exist", async () => {
    writePackage(path.join(tmpDir, "apps", "github"), {
      name: "@test/app-github",
      version: "1.0.0",
      chapter: {
        type: "app",
        transport: "stdio",
        command: "npx",
        args: ["-y", "server"],
        tools: ["create_issue"],
        capabilities: ["tools"],
      },
    });

    writePackage(path.join(tmpDir, "roles", "manager"), {
      name: "@test/role-manager",
      version: "1.0.0",
      chapter: {
        type: "role",
        permissions: {
          "@test/app-github": { allow: ["create_issue"], deny: [] },
        },
      },
    });

    await runRemove(tmpDir, "@test/app-github", { force: false, npmArgs: [] });

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("depend on it");
    expect(errorOutput).toContain("@test/role-manager");
    expect(errorOutput).toContain("--force");

    // npm uninstall should NOT have been called
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it("allows forced removal with dependents", async () => {
    writePackage(path.join(tmpDir, "apps", "github"), {
      name: "@test/app-github",
      version: "1.0.0",
      chapter: {
        type: "app",
        transport: "stdio",
        command: "npx",
        args: ["-y", "server"],
        tools: ["create_issue"],
        capabilities: ["tools"],
      },
    });

    writePackage(path.join(tmpDir, "roles", "manager"), {
      name: "@test/role-manager",
      version: "1.0.0",
      chapter: {
        type: "role",
        permissions: {
          "@test/app-github": { allow: ["create_issue"], deny: [] },
        },
      },
    });

    await runRemove(tmpDir, "@test/app-github", { force: true, npmArgs: [] });

    expect(exitSpy).not.toHaveBeenCalledWith(1);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("✔"));

    // npm uninstall should have been called despite dependents
    expect(mockExecFileSync).toHaveBeenCalledWith(
      "npm",
      ["uninstall", "@test/app-github"],
      expect.objectContaining({ cwd: tmpDir }),
    );
  });

  it("handles npm uninstall failure", async () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error("npm uninstall failed");
    });

    await runRemove(tmpDir, "@test/nonexistent", { force: false, npmArgs: [] });

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("Remove failed");
  });

  it("forwards extra npm args", async () => {
    await runRemove(tmpDir, "@test/app-github", { force: false, npmArgs: ["--no-save"] });

    expect(mockExecFileSync).toHaveBeenCalledWith(
      "npm",
      ["uninstall", "@test/app-github", "--no-save"],
      expect.objectContaining({ cwd: tmpDir }),
    );
  });
});
