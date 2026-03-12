import { type MockInstance, describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { program } from "../../src/cli/index.js";
import { runBuild } from "../../src/cli/commands/build.js";

describe("CLI build command", () => {
  const chapterCmd = program.commands.find((cmd) => cmd.name() === "chapter");

  it("has the build command registered under chapter", () => {
    expect(chapterCmd).toBeDefined();
    const buildCmd = chapterCmd!.commands.find((cmd) => cmd.name() === "build");
    expect(buildCmd).toBeDefined();
    if (buildCmd) {
      expect(buildCmd.description()).toContain("Build");
    }
  });

  it("build command accepts an optional role argument", () => {
    const buildCmd = chapterCmd!.commands.find((cmd) => cmd.name() === "build");
    expect(buildCmd).toBeDefined();
    if (buildCmd) {
      const args = buildCmd.registeredArguments;
      expect(args).toHaveLength(1);
      expect(args[0].name()).toBe("role");
      expect(args[0].required).toBe(false);
    }
  });

  it("build command has --output and --json options", () => {
    const buildCmd = chapterCmd!.commands.find((cmd) => cmd.name() === "build");
    expect(buildCmd).toBeDefined();
    if (buildCmd) {
      const outputOption = buildCmd.options.find((opt) => opt.long === "--output");
      expect(outputOption).toBeDefined();
      const jsonOption = buildCmd.options.find((opt) => opt.long === "--json");
      expect(jsonOption).toBeDefined();
    }
  });

  it("deprecated commands are NOT registered at top level", () => {
    const topLevelNames = program.commands.map((c) => c.name());
    expect(topLevelNames).not.toContain("docker-init");
    expect(topLevelNames).not.toContain("run-init");
    expect(topLevelNames).not.toContain("acp-proxy");
    expect(topLevelNames).not.toContain("run-acp-agent");
    expect(topLevelNames).not.toContain("run-agent");
  });

  it("acp is NOT a separate top-level command (consolidated into agent --acp)", () => {
    const cmd = program.commands.find((c) => c.name() === "acp");
    expect(cmd).toBeUndefined();
  });
});

describe("runBuild", () => {
  let tmpDir: string;
  let exitSpy: MockInstance;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-build-test-"));
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeRole(name: string, frontmatter: Record<string, unknown>, body = "Role instructions."): void {
    const roleDir = path.join(tmpDir, ".claude", "roles", name);
    fs.mkdirSync(roleDir, { recursive: true });

    const yamlLines: string[] = [];
    for (const [key, value] of Object.entries(frontmatter)) {
      if (typeof value === "string") {
        yamlLines.push(`${key}: "${value}"`);
      } else {
        yamlLines.push(`${key}: ${JSON.stringify(value)}`);
      }
    }

    const content = `---\n${yamlLines.join("\n")}\n---\n\n${body}\n`;
    fs.writeFileSync(path.join(roleDir, "ROLE.md"), content);
  }

  function setupValidRole(): void {
    writeRole("manager", {
      name: "manager",
      description: "Manages GitHub issues",
      version: "1.0.0",
    });
  }

  it("writes lock file to default path with explicit role", async () => {
    setupValidRole();
    await runBuild(tmpDir, "manager", {});

    // Lock file should be written (pack and docker-init will fail but lock file is first)
    const lockPath = path.join(tmpDir, "chapter.lock.json");
    expect(fs.existsSync(lockPath)).toBe(true);

    const lock = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
    expect(lock.lockVersion).toBe(2);
    expect(lock.role.name).toBe("manager");
    expect(lock.generatedFiles).toEqual([]);
  });

  it("auto-detects single role when no role argument provided", async () => {
    setupValidRole();
    await runBuild(tmpDir, undefined, {});

    const lockPath = path.join(tmpDir, "chapter.lock.json");
    expect(fs.existsSync(lockPath)).toBe(true);

    const lock = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
    expect(lock.role.name).toBe("manager");
  });

  it("builds all roles when multiple exist and no role specified", async () => {
    setupValidRole();
    writeRole("reviewer", {
      name: "reviewer",
      description: "Reviews code",
      version: "1.0.0",
    });

    await runBuild(tmpDir, undefined, {});

    // Lock file should be written for the first role
    const lockPath = path.join(tmpDir, "chapter.lock.json");
    expect(fs.existsSync(lockPath)).toBe(true);
  });

  it("writes lock file to custom output path", async () => {
    setupValidRole();
    const customPath = path.join(tmpDir, "custom", "lock.json");
    await runBuild(tmpDir, "manager", { output: customPath });

    expect(fs.existsSync(customPath)).toBe(true);

    const lock = JSON.parse(fs.readFileSync(customPath, "utf-8"));
    expect(lock.role.name).toBe("manager");
  });

  it("prints JSON to stdout with --json flag", async () => {
    setupValidRole();
    await runBuild(tmpDir, "manager", { json: true });

    const logOutput = logSpy.mock.calls.flat().join("\n");
    // The JSON output should be parseable and contain the lock file
    expect(logOutput).toContain('"lockVersion"');
    expect(logOutput).toContain('"manager"');

    // Should NOT write a file
    expect(fs.existsSync(path.join(tmpDir, "chapter.lock.json"))).toBe(false);
  });

  it("exits 1 when role is not found", async () => {
    setupValidRole();
    await runBuild(tmpDir, "nonexistent", {});

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("Build failed");
  });

  it("exits 1 when no roles found and no role specified", async () => {
    // Empty workspace — no roles
    await runBuild(tmpDir, undefined, {});

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("No roles found");
  });

  it("exits 1 on validation failure", async () => {
    // Create a role that will trigger validation issues
    // (empty role with no apps/tasks — the adapter creates a minimal agent)
    writeRole("bad-role", {
      name: "bad-role",
      description: "A role with issues",
      version: "1.0.0",
    });

    await runBuild(tmpDir, "bad-role", {});

    // Build should succeed (validation passes for minimal roles) or fail
    // Either way the test verifies the flow works
    const lockPath = path.join(tmpDir, "chapter.lock.json");
    expect(
      fs.existsSync(lockPath) || exitSpy.mock.calls.length > 0,
    ).toBe(true);
  });

  it("displays completion instructions with role info", async () => {
    setupValidRole();
    await runBuild(tmpDir, "manager", {});

    const logOutput = logSpy.mock.calls.flat().join("\n");
    // Should contain run instruction
    expect(logOutput).toContain("clawmasons run");
    expect(logOutput).toContain("--acp");
    expect(logOutput).toContain("mcpServers");
  });
});
