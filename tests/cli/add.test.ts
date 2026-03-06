import { type MockInstance, describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { program } from "../../src/cli/index.js";
import { runAdd } from "../../src/cli/commands/add.js";

// Mock child_process.execFileSync
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from "node:child_process";
const mockExecFileSync = vi.mocked(execFileSync);

describe("CLI add command", () => {
  it("has the add command registered", () => {
    const addCmd = program.commands.find((cmd) => cmd.name() === "add");
    expect(addCmd).toBeDefined();
    if (addCmd) {
      expect(addCmd.description()).toContain("Add");
    }
  });

  it("add command accepts a pkg argument", () => {
    const addCmd = program.commands.find((cmd) => cmd.name() === "add");
    expect(addCmd).toBeDefined();
    if (addCmd) {
      const args = addCmd.registeredArguments;
      expect(args.length).toBeGreaterThanOrEqual(1);
      expect(args[0].name()).toBe("pkg");
      expect(args[0].required).toBe(true);
    }
  });
});

describe("runAdd", () => {
  let tmpDir: string;
  let exitSpy: MockInstance;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-add-test-"));
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockExecFileSync.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeNodeModulesPackage(
    pkgName: string,
    pkgJson: Record<string, unknown>,
  ): void {
    const dir = path.join(tmpDir, "node_modules", ...pkgName.split("/"));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkgJson, null, 2));
  }

  it("adds a valid forge package successfully", async () => {
    // Simulate npm install by pre-creating the package in node_modules
    mockExecFileSync.mockImplementation((cmd, args) => {
      if (cmd === "npm" && (args as string[])[0] === "install") {
        writeNodeModulesPackage("@test/app-github", {
          name: "@test/app-github",
          version: "1.0.0",
          forge: {
            type: "app",
            transport: "stdio",
            command: "npx",
            args: ["-y", "server"],
            tools: ["create_issue"],
            capabilities: ["tools"],
          },
        });
      }
      return Buffer.from("");
    });

    await runAdd(tmpDir, "@test/app-github", { npmArgs: [] });

    expect(exitSpy).not.toHaveBeenCalledWith(1);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("✔"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("app"));

    // Verify npm install was called
    expect(mockExecFileSync).toHaveBeenCalledWith(
      "npm",
      ["install", "@test/app-github"],
      expect.objectContaining({ cwd: tmpDir, stdio: "inherit" }),
    );
  });

  it("rejects a package missing the forge field and rolls back", async () => {
    mockExecFileSync.mockImplementation((cmd, args) => {
      if (cmd === "npm" && (args as string[])[0] === "install") {
        writeNodeModulesPackage("plain-pkg", {
          name: "plain-pkg",
          version: "1.0.0",
        });
      }
      return Buffer.from("");
    });

    await runAdd(tmpDir, "plain-pkg", { npmArgs: [] });

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("not a valid forge package");

    // Verify rollback (npm uninstall) was called
    expect(mockExecFileSync).toHaveBeenCalledWith(
      "npm",
      ["uninstall", "plain-pkg"],
      expect.objectContaining({ cwd: tmpDir }),
    );
  });

  it("rejects a package with an invalid forge field and rolls back", async () => {
    mockExecFileSync.mockImplementation((cmd, args) => {
      if (cmd === "npm" && (args as string[])[0] === "install") {
        writeNodeModulesPackage("bad-forge-pkg", {
          name: "bad-forge-pkg",
          version: "1.0.0",
          forge: {
            type: "app",
            // Missing required fields: transport, tools, capabilities
          },
        });
      }
      return Buffer.from("");
    });

    await runAdd(tmpDir, "bad-forge-pkg", { npmArgs: [] });

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("invalid forge field");

    // Verify rollback
    expect(mockExecFileSync).toHaveBeenCalledWith(
      "npm",
      ["uninstall", "bad-forge-pkg"],
      expect.objectContaining({ cwd: tmpDir }),
    );
  });

  it("handles npm install failure", async () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error("npm install failed");
    });

    await runAdd(tmpDir, "@test/nonexistent", { npmArgs: [] });

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("Add failed");
  });

  it("forwards extra npm args", async () => {
    mockExecFileSync.mockImplementation((cmd, args) => {
      if (cmd === "npm" && (args as string[])[0] === "install") {
        writeNodeModulesPackage("@test/app-github", {
          name: "@test/app-github",
          version: "1.0.0",
          forge: {
            type: "app",
            transport: "stdio",
            command: "npx",
            args: ["-y", "server"],
            tools: ["create_issue"],
            capabilities: ["tools"],
          },
        });
      }
      return Buffer.from("");
    });

    await runAdd(tmpDir, "@test/app-github", { npmArgs: ["--save-dev"] });

    expect(mockExecFileSync).toHaveBeenCalledWith(
      "npm",
      ["install", "@test/app-github", "--save-dev"],
      expect.objectContaining({ cwd: tmpDir }),
    );
  });

  it("resolves scoped package path correctly", async () => {
    mockExecFileSync.mockImplementation((cmd, args) => {
      if (cmd === "npm" && (args as string[])[0] === "install") {
        writeNodeModulesPackage("@clawmasons/app-github", {
          name: "@clawmasons/app-github",
          version: "1.0.0",
          forge: {
            type: "app",
            transport: "stdio",
            command: "npx",
            args: ["-y", "server"],
            tools: ["create_issue"],
            capabilities: ["tools"],
          },
        });
      }
      return Buffer.from("");
    });

    await runAdd(tmpDir, "@clawmasons/app-github", { npmArgs: [] });

    expect(exitSpy).not.toHaveBeenCalledWith(1);

    // Verify the scoped package was found at node_modules/@clawmasons/app-github
    const pkgPath = path.join(tmpDir, "node_modules", "@clawmasons", "app-github", "package.json");
    expect(fs.existsSync(pkgPath)).toBe(true);
  });
});
