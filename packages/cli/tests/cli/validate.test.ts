import { type MockInstance, describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { program } from "../../src/cli/index.js";
import { runValidate } from "../../src/cli/commands/validate.js";

describe("CLI validate command", () => {
  it("has the validate command registered", () => {
    const validateCmd = program.commands.find((cmd) => cmd.name() === "validate");
    expect(validateCmd).toBeDefined();
    if (validateCmd) {
      expect(validateCmd.description()).toContain("Validate");
    }
  });

  it("validate command accepts a member argument", () => {
    const validateCmd = program.commands.find((cmd) => cmd.name() === "validate");
    expect(validateCmd).toBeDefined();
    if (validateCmd) {
      const args = validateCmd.registeredArguments;
      expect(args).toHaveLength(1);
      expect(args[0].name()).toBe("agent");
      expect(args[0].required).toBe(true);
    }
  });

  it("validate command has --json option", () => {
    const validateCmd = program.commands.find((cmd) => cmd.name() === "validate");
    expect(validateCmd).toBeDefined();
    if (validateCmd) {
      const jsonOption = validateCmd.options.find((opt) => opt.long === "--json");
      expect(jsonOption).toBeDefined();
    }
  });
});

describe("runValidate", () => {
  let tmpDir: string;
  let exitSpy: MockInstance;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-validate-test-"));
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
    // App
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

    // Skill
    writePackage(path.join(tmpDir, "skills", "labeling"), {
      name: "@test/skill-labeling",
      version: "1.0.0",
      chapter: {
        type: "skill",
        artifacts: ["./SKILL.md"],
        description: "Labeling taxonomy",
      },
    });

    // Task
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

    // Role
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

    // Member
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

  function setupInvalidMember(): void {
    // App
    writePackage(path.join(tmpDir, "apps", "github"), {
      name: "@test/app-github",
      version: "1.0.0",
      chapter: {
        type: "app",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        tools: ["create_issue"],
        capabilities: ["tools"],
      },
    });

    // Skill
    writePackage(path.join(tmpDir, "skills", "labeling"), {
      name: "@test/skill-labeling",
      version: "1.0.0",
      chapter: {
        type: "skill",
        artifacts: ["./SKILL.md"],
        description: "Labeling taxonomy",
      },
    });

    // Task
    writePackage(path.join(tmpDir, "tasks", "triage"), {
      name: "@test/task-triage",
      version: "1.0.0",
      chapter: {
        type: "task",
        taskType: "subagent",
        requires: {
          apps: ["@test/app-github"],
          skills: ["@test/skill-labeling"],
        },
      },
    });

    // Role -- allows a tool that doesn't exist on the app
    writePackage(path.join(tmpDir, "roles", "manager"), {
      name: "@test/role-manager",
      version: "1.0.0",
      chapter: {
        type: "role",
        tasks: ["@test/task-triage"],
        skills: ["@test/skill-labeling"],
        permissions: {
          "@test/app-github": {
            allow: ["create_issue", "nonexistent_tool"],
            deny: [],
          },
        },
      },
    });

    // Member
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

  it("exits 0 and prints success for valid member", async () => {
    setupValidMember();
    await runValidate(tmpDir, "@test/agent-ops", {});

    expect(exitSpy).toHaveBeenCalledWith(0);
    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("valid");
  });

  it("exits 1 and prints errors for invalid member", async () => {
    setupInvalidMember();
    await runValidate(tmpDir, "@test/agent-ops", {});

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("validation error");
    expect(errorOutput).toContain("nonexistent_tool");
  });

  it("outputs JSON when --json flag is set for valid member", async () => {
    setupValidMember();
    await runValidate(tmpDir, "@test/agent-ops", { json: true });

    expect(exitSpy).toHaveBeenCalledWith(0);
    const logOutput = logSpy.mock.calls.flat().join("\n");
    const parsed = JSON.parse(logOutput);
    expect(parsed.valid).toBe(true);
    expect(parsed.errors).toEqual([]);
  });

  it("outputs JSON when --json flag is set for invalid member", async () => {
    setupInvalidMember();
    await runValidate(tmpDir, "@test/agent-ops", { json: true });

    expect(exitSpy).toHaveBeenCalledWith(1);
    const logOutput = logSpy.mock.calls.flat().join("\n");
    const parsed = JSON.parse(logOutput);
    expect(parsed.valid).toBe(false);
    expect(parsed.errors.length).toBeGreaterThan(0);
    expect(parsed.errors[0].category).toBe("tool-existence");
  });

  it("shows credential coverage warnings for valid member with missing app credentials", async () => {
    // App with credentials
    writePackage(path.join(tmpDir, "apps", "web-search"), {
      name: "@test/app-web-search",
      version: "1.0.0",
      chapter: {
        type: "app",
        transport: "stdio",
        command: "npx",
        args: ["-y", "web-search-server"],
        tools: ["search"],
        capabilities: ["tools"],
        credentials: ["SERP_API_KEY"],
      },
    });

    // Role using the app
    writePackage(path.join(tmpDir, "roles", "researcher"), {
      name: "@test/role-researcher",
      version: "1.0.0",
      chapter: {
        type: "role",
        permissions: {
          "@test/app-web-search": {
            allow: ["search"],
            deny: [],
          },
        },
      },
    });

    // Agent that does NOT declare SERP_API_KEY
    writePackage(path.join(tmpDir, "agents", "researcher"), {
      name: "@test/agent-researcher",
      version: "1.0.0",
      chapter: {
        type: "agent",
        name: "Researcher",
        slug: "researcher",
        runtimes: ["claude-code"],
        roles: ["@test/role-researcher"],
        credentials: [],
      },
    });

    await runValidate(tmpDir, "@test/agent-researcher", {});

    // Should still be valid (warnings don't affect validity)
    expect(exitSpy).toHaveBeenCalledWith(0);
    // Re-run to capture warn output
    vi.restoreAllMocks();
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnMock = vi.spyOn(console, "warn").mockImplementation(() => {});

    await runValidate(tmpDir, "@test/agent-researcher", {});
    expect(exitSpy).toHaveBeenCalledWith(0);
    const warnOutput = warnMock.mock.calls.flat().join("\n");
    expect(warnOutput).toContain("credential-coverage");
    expect(warnOutput).toContain("SERP_API_KEY");
  });

  it("exits 1 when member is not found", async () => {
    // Empty workspace -- no packages
    await runValidate(tmpDir, "@test/nonexistent", {});

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("not found");
  });

  it("outputs JSON error when member is not found with --json", async () => {
    await runValidate(tmpDir, "@test/nonexistent", { json: true });

    expect(exitSpy).toHaveBeenCalledWith(1);
    const logOutput = logSpy.mock.calls.flat().join("\n");
    const parsed = JSON.parse(logOutput);
    expect(parsed.valid).toBe(false);
    expect(parsed.errors.length).toBeGreaterThan(0);
  });
});
