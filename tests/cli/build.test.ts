import { type MockInstance, describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { program } from "../../src/cli/index.js";
import { runBuild } from "../../src/cli/commands/build.js";

describe("CLI build command", () => {
  it("has the build command registered", () => {
    const buildCmd = program.commands.find((cmd) => cmd.name() === "build");
    expect(buildCmd).toBeDefined();
    if (buildCmd) {
      expect(buildCmd.description()).toContain("Resolve");
    }
  });

  it("build command accepts a member argument", () => {
    const buildCmd = program.commands.find((cmd) => cmd.name() === "build");
    expect(buildCmd).toBeDefined();
    if (buildCmd) {
      const args = buildCmd.registeredArguments;
      expect(args).toHaveLength(1);
      expect(args[0].name()).toBe("member");
      expect(args[0].required).toBe(true);
    }
  });

  it("build command has --output and --json options", () => {
    const buildCmd = program.commands.find((cmd) => cmd.name() === "build");
    expect(buildCmd).toBeDefined();
    if (buildCmd) {
      const outputOption = buildCmd.options.find((opt) => opt.long === "--output");
      expect(outputOption).toBeDefined();
      const jsonOption = buildCmd.options.find((opt) => opt.long === "--json");
      expect(jsonOption).toBeDefined();
    }
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

    writePackage(path.join(tmpDir, "members", "ops"), {
      name: "@test/member-ops",
      version: "1.0.0",
      chapter: {
        type: "member",
        memberType: "agent",
        name: "Ops",
        slug: "ops",
        email: "ops@chapter.local",
        runtimes: ["claude-code"],
        roles: ["@test/role-manager"],
      },
    });
  }

  it("writes lock file to default path", async () => {
    setupValidMember();
    await runBuild(tmpDir, "@test/member-ops", {});

    expect(exitSpy).not.toHaveBeenCalledWith(1);

    const lockPath = path.join(tmpDir, "chapter.lock.json");
    expect(fs.existsSync(lockPath)).toBe(true);

    const lock = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
    expect(lock.lockVersion).toBe(1);
    expect(lock.member.name).toBe("@test/member-ops");
    expect(lock.member.runtimes).toContain("claude-code");
    expect(lock.roles).toHaveLength(1);
    expect(lock.roles[0].name).toBe("@test/role-manager");
    expect(lock.generatedFiles).toEqual([]);
  });

  it("writes lock file to custom output path", async () => {
    setupValidMember();
    const customPath = path.join(tmpDir, "custom", "lock.json");
    await runBuild(tmpDir, "@test/member-ops", { output: customPath });

    expect(exitSpy).not.toHaveBeenCalledWith(1);
    expect(fs.existsSync(customPath)).toBe(true);

    const lock = JSON.parse(fs.readFileSync(customPath, "utf-8"));
    expect(lock.member.name).toBe("@test/member-ops");
  });

  it("prints JSON to stdout with --json flag", async () => {
    setupValidMember();
    await runBuild(tmpDir, "@test/member-ops", { json: true });

    expect(exitSpy).not.toHaveBeenCalledWith(1);

    const logOutput = logSpy.mock.calls.flat().join("\n");
    const parsed = JSON.parse(logOutput);
    expect(parsed.lockVersion).toBe(1);
    expect(parsed.member.name).toBe("@test/member-ops");

    // Should NOT write a file
    expect(fs.existsSync(path.join(tmpDir, "chapter.lock.json"))).toBe(false);
  });

  it("exits 1 when member is not found", async () => {
    await runBuild(tmpDir, "@test/nonexistent", {});

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("Build failed");
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

    writePackage(path.join(tmpDir, "members", "ops"), {
      name: "@test/member-ops",
      version: "1.0.0",
      chapter: {
        type: "member",
        memberType: "agent",
        name: "Ops",
        slug: "ops",
        email: "ops@chapter.local",
        runtimes: ["claude-code"],
        roles: ["@test/role-manager"],
      },
    });

    await runBuild(tmpDir, "@test/member-ops", {});

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("validation");
  });
});
