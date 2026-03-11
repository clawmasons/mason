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

  it("build command accepts an optional agent argument", () => {
    const buildCmd = chapterCmd!.commands.find((cmd) => cmd.name() === "build");
    expect(buildCmd).toBeDefined();
    if (buildCmd) {
      const args = buildCmd.registeredArguments;
      expect(args).toHaveLength(1);
      expect(args[0].name()).toBe("agent");
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

  function writePackage(dir: string, pkg: Record<string, unknown>): void {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2));
  }

  function setupValidMember(): void {
    writePackage(path.join(tmpDir, "apps", "github"), {
      name: "@test/app-github",
      version: "1.0.0",
      chapter: {
        type: "app",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        tools: ["create_issue", "list_repos"],
        capabilities: ["tools"],
      },
    });

    writePackage(path.join(tmpDir, "skills", "labeling"), {
      name: "@test/skill-labeling",
      version: "1.0.0",
      chapter: {
        type: "skill",
        artifacts: ["./SKILL.md"],
        description: "Labeling taxonomy",
      },
    });

    writePackage(path.join(tmpDir, "tasks", "triage"), {
      name: "@test/task-triage",
      version: "1.0.0",
      chapter: {
        type: "task",
        taskType: "subagent",
        prompt: "./triage.md",
        requires: {
          apps: ["@test/app-github"],
          skills: ["@test/skill-labeling"],
        },
      },
    });

    writePackage(path.join(tmpDir, "roles", "manager"), {
      name: "@test/role-manager",
      version: "1.0.0",
      chapter: {
        type: "role",
        tasks: ["@test/task-triage"],
        skills: ["@test/skill-labeling"],
        permissions: {
          "@test/app-github": {
            allow: ["create_issue", "list_repos"],
            deny: [],
          },
        },
      },
    });

    writePackage(path.join(tmpDir, "agents", "ops"), {
      name: "@test/agent-ops",
      version: "1.0.0",
      chapter: {
        type: "agent",        name: "Ops",
        slug: "ops",        runtimes: ["claude-code"],
        roles: ["@test/role-manager"],
      },
    });
  }

  it("writes lock file to default path with explicit agent", async () => {
    setupValidMember();
    await runBuild(tmpDir, "@test/agent-ops", {});

    // Lock file should be written (pack and docker-init will fail but lock file is first)
    const lockPath = path.join(tmpDir, "chapter.lock.json");
    expect(fs.existsSync(lockPath)).toBe(true);

    const lock = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
    expect(lock.lockVersion).toBe(1);
    expect(lock.agent.name).toBe("@test/agent-ops");
    expect(lock.agent.runtimes).toContain("claude-code");
    expect(lock.roles).toHaveLength(1);
    expect(lock.roles[0].name).toBe("@test/role-manager");
    expect(lock.generatedFiles).toEqual([]);
  });

  it("auto-detects single agent when no agent argument provided", async () => {
    setupValidMember();
    await runBuild(tmpDir, undefined, {});

    const lockPath = path.join(tmpDir, "chapter.lock.json");
    expect(fs.existsSync(lockPath)).toBe(true);

    const lock = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
    expect(lock.agent.name).toBe("@test/agent-ops");
  });

  it("builds all agents when multiple exist and no agent specified", async () => {
    setupValidMember();

    // Add a second agent using the same role
    writePackage(path.join(tmpDir, "agents", "researcher"), {
      name: "@test/agent-researcher",
      version: "1.0.0",
      chapter: {
        type: "agent",
        name: "Researcher",
        slug: "researcher",
        runtimes: ["claude-code"],
        roles: ["@test/role-manager"],
      },
    });

    await runBuild(tmpDir, undefined, {});

    // Lock file should be written for the first agent
    const lockPath = path.join(tmpDir, "chapter.lock.json");
    expect(fs.existsSync(lockPath)).toBe(true);
  });

  it("writes lock file to custom output path", async () => {
    setupValidMember();
    const customPath = path.join(tmpDir, "custom", "lock.json");
    await runBuild(tmpDir, "@test/agent-ops", { output: customPath });

    expect(fs.existsSync(customPath)).toBe(true);

    const lock = JSON.parse(fs.readFileSync(customPath, "utf-8"));
    expect(lock.agent.name).toBe("@test/agent-ops");
  });

  it("prints JSON to stdout with --json flag", async () => {
    setupValidMember();
    await runBuild(tmpDir, "@test/agent-ops", { json: true });

    const logOutput = logSpy.mock.calls.flat().join("\n");
    // The JSON output should be parseable and contain the lock file
    expect(logOutput).toContain('"lockVersion"');
    expect(logOutput).toContain('"@test/agent-ops"');

    // Should NOT write a file
    expect(fs.existsSync(path.join(tmpDir, "chapter.lock.json"))).toBe(false);
  });

  it("exits 1 when agent is not found", async () => {
    await runBuild(tmpDir, "@test/nonexistent", {});

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("Build failed");
  });

  it("exits 1 when no agents found and no agent specified", async () => {
    // Empty workspace — no agent packages
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

    await runBuild(tmpDir, undefined, {});

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("No agent packages found");
  });

  it("exits 1 on validation failure", async () => {
    // App with limited tools
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
        requires: { apps: ["@test/app-github"], skills: ["@test/skill-labeling"] },
      },
    });

    // Role allows a tool that doesn't exist on the app
    writePackage(path.join(tmpDir, "roles", "manager"), {
      name: "@test/role-manager",
      version: "1.0.0",
      chapter: {
        type: "role",
        tasks: ["@test/task-triage"],
        skills: ["@test/skill-labeling"],
        permissions: {
          "@test/app-github": { allow: ["create_issue", "nonexistent_tool"], deny: [] },
        },
      },
    });

    writePackage(path.join(tmpDir, "agents", "ops"), {
      name: "@test/agent-ops",
      version: "1.0.0",
      chapter: {
        type: "agent",        name: "Ops",
        slug: "ops",        runtimes: ["claude-code"],
        roles: ["@test/role-manager"],
      },
    });

    await runBuild(tmpDir, "@test/agent-ops", {});

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("validation");
  });

  it("displays completion instructions with agent and role info", async () => {
    setupValidMember();
    await runBuild(tmpDir, "@test/agent-ops", {});

    const logOutput = logSpy.mock.calls.flat().join("\n");
    // Should contain agent instruction
    expect(logOutput).toContain("clawmasons agent");
    expect(logOutput).toContain("clawmasons agent --acp");
    expect(logOutput).toContain("mcpServers");
  });
});
