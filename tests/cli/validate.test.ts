import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

  it("validate command accepts an agent argument", () => {
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
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-validate-test-"));
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

  function setupValidAgent(): void {
    // App
    writePackage(path.join(tmpDir, "apps", "github"), {
      name: "@test/app-github",
      version: "1.0.0",
      forge: {
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
      forge: {
        type: "skill",
        artifacts: ["./SKILL.md"],
        description: "Labeling taxonomy",
      },
    });

    // Task
    writePackage(path.join(tmpDir, "tasks", "triage"), {
      name: "@test/task-triage",
      version: "1.0.0",
      forge: {
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
      forge: {
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

    // Agent
    writePackage(path.join(tmpDir, "agents", "ops"), {
      name: "@test/agent-ops",
      version: "1.0.0",
      forge: {
        type: "agent",
        runtimes: ["claude-code"],
        roles: ["@test/role-manager"],
      },
    });
  }

  function setupInvalidAgent(): void {
    // App
    writePackage(path.join(tmpDir, "apps", "github"), {
      name: "@test/app-github",
      version: "1.0.0",
      forge: {
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
      forge: {
        type: "skill",
        artifacts: ["./SKILL.md"],
        description: "Labeling taxonomy",
      },
    });

    // Task
    writePackage(path.join(tmpDir, "tasks", "triage"), {
      name: "@test/task-triage",
      version: "1.0.0",
      forge: {
        type: "task",
        taskType: "subagent",
        requires: {
          apps: ["@test/app-github"],
          skills: ["@test/skill-labeling"],
        },
      },
    });

    // Role — allows a tool that doesn't exist on the app
    writePackage(path.join(tmpDir, "roles", "manager"), {
      name: "@test/role-manager",
      version: "1.0.0",
      forge: {
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

    // Agent
    writePackage(path.join(tmpDir, "agents", "ops"), {
      name: "@test/agent-ops",
      version: "1.0.0",
      forge: {
        type: "agent",
        runtimes: ["claude-code"],
        roles: ["@test/role-manager"],
      },
    });
  }

  it("exits 0 and prints success for valid agent", async () => {
    setupValidAgent();
    await runValidate(tmpDir, "@test/agent-ops", {});

    expect(exitSpy).toHaveBeenCalledWith(0);
    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("valid");
  });

  it("exits 1 and prints errors for invalid agent", async () => {
    setupInvalidAgent();
    await runValidate(tmpDir, "@test/agent-ops", {});

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("validation error");
    expect(errorOutput).toContain("nonexistent_tool");
  });

  it("outputs JSON when --json flag is set for valid agent", async () => {
    setupValidAgent();
    await runValidate(tmpDir, "@test/agent-ops", { json: true });

    expect(exitSpy).toHaveBeenCalledWith(0);
    const logOutput = logSpy.mock.calls.flat().join("\n");
    const parsed = JSON.parse(logOutput);
    expect(parsed.valid).toBe(true);
    expect(parsed.errors).toEqual([]);
  });

  it("outputs JSON when --json flag is set for invalid agent", async () => {
    setupInvalidAgent();
    await runValidate(tmpDir, "@test/agent-ops", { json: true });

    expect(exitSpy).toHaveBeenCalledWith(1);
    const logOutput = logSpy.mock.calls.flat().join("\n");
    const parsed = JSON.parse(logOutput);
    expect(parsed.valid).toBe(false);
    expect(parsed.errors.length).toBeGreaterThan(0);
    expect(parsed.errors[0].category).toBe("tool-existence");
  });

  it("exits 1 when agent is not found", async () => {
    // Empty workspace — no packages
    await runValidate(tmpDir, "@test/nonexistent", {});

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("not found");
  });

  it("outputs JSON error when agent is not found with --json", async () => {
    await runValidate(tmpDir, "@test/nonexistent", { json: true });

    expect(exitSpy).toHaveBeenCalledWith(1);
    const logOutput = logSpy.mock.calls.flat().join("\n");
    const parsed = JSON.parse(logOutput);
    expect(parsed.valid).toBe(false);
    expect(parsed.errors.length).toBeGreaterThan(0);
  });
});
