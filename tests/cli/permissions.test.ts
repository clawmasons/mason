import { type MockInstance, describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { program } from "../../src/cli/index.js";
import { runPermissions } from "../../src/cli/commands/permissions.js";

describe("CLI permissions command", () => {
  it("has the permissions command registered", () => {
    const permsCmd = program.commands.find((cmd) => cmd.name() === "permissions");
    expect(permsCmd).toBeDefined();
    if (permsCmd) {
      expect(permsCmd.description()).toContain("permission");
    }
  });

  it("permissions command accepts an agent argument", () => {
    const permsCmd = program.commands.find((cmd) => cmd.name() === "permissions");
    expect(permsCmd).toBeDefined();
    if (permsCmd) {
      const args = permsCmd.registeredArguments;
      expect(args).toHaveLength(1);
      expect(args[0].name()).toBe("agent");
      expect(args[0].required).toBe(true);
    }
  });

  it("permissions command has --json option", () => {
    const permsCmd = program.commands.find((cmd) => cmd.name() === "permissions");
    expect(permsCmd).toBeDefined();
    if (permsCmd) {
      const jsonOption = permsCmd.options.find((opt) => opt.long === "--json");
      expect(jsonOption).toBeDefined();
    }
  });
});

describe("runPermissions", () => {
  let tmpDir: string;
  let exitSpy: MockInstance;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-perms-test-"));
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

  function setupTwoRoleAgent(): void {
    writePackage(path.join(tmpDir, "apps", "github"), {
      name: "@test/app-github",
      version: "1.0.0",
      forge: {
        type: "app",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        tools: ["create_issue", "list_repos", "get_pr", "create_review", "add_label"],
        capabilities: ["tools"],
      },
    });

    writePackage(path.join(tmpDir, "skills", "labeling"), {
      name: "@test/skill-labeling",
      version: "1.0.0",
      forge: {
        type: "skill",
        artifacts: ["./SKILL.md"],
        description: "Labeling taxonomy",
      },
    });

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

    writePackage(path.join(tmpDir, "tasks", "review"), {
      name: "@test/task-review",
      version: "1.0.0",
      forge: {
        type: "task",
        taskType: "subagent",
        prompt: "./review.md",
        requires: {
          apps: ["@test/app-github"],
          skills: [],
        },
      },
    });

    // Role 1: issue-manager
    writePackage(path.join(tmpDir, "roles", "issue-manager"), {
      name: "@test/role-issue-manager",
      version: "1.0.0",
      forge: {
        type: "role",
        tasks: ["@test/task-triage"],
        skills: ["@test/skill-labeling"],
        permissions: {
          "@test/app-github": {
            allow: ["create_issue", "list_repos", "add_label"],
            deny: ["get_pr"],
          },
        },
      },
    });

    // Role 2: pr-reviewer
    writePackage(path.join(tmpDir, "roles", "pr-reviewer"), {
      name: "@test/role-pr-reviewer",
      version: "1.0.0",
      forge: {
        type: "role",
        tasks: ["@test/task-review"],
        skills: [],
        permissions: {
          "@test/app-github": {
            allow: ["list_repos", "get_pr", "create_review"],
            deny: [],
          },
        },
      },
    });

    writePackage(path.join(tmpDir, "agents", "ops"), {
      name: "@test/agent-ops",
      version: "1.0.0",
      forge: {
        type: "agent",
        runtimes: ["claude-code"],
        roles: ["@test/role-issue-manager", "@test/role-pr-reviewer"],
      },
    });
  }

  it("displays per-role permission breakdown", async () => {
    setupTwoRoleAgent();
    await runPermissions(tmpDir, "@test/agent-ops", {});

    expect(exitSpy).not.toHaveBeenCalledWith(1);

    const logOutput = logSpy.mock.calls.flat().join("\n");
    // Per-role sections
    expect(logOutput).toContain("Role: issue-manager");
    expect(logOutput).toContain("Role: pr-reviewer");
    expect(logOutput).toContain("create_issue");
    expect(logOutput).toContain("get_pr");
    expect(logOutput).toContain("create_review");
  });

  it("displays deny list when present", async () => {
    setupTwoRoleAgent();
    await runPermissions(tmpDir, "@test/agent-ops", {});

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("deny:");
    expect(logOutput).toContain("get_pr");
  });

  it("displays proxy-level toolFilter union", async () => {
    setupTwoRoleAgent();
    await runPermissions(tmpDir, "@test/agent-ops", {});

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("Proxy toolFilter");

    // Union should contain tools from both roles
    expect(logOutput).toContain("create_issue");
    expect(logOutput).toContain("list_repos");
    expect(logOutput).toContain("add_label");
    expect(logOutput).toContain("get_pr");
    expect(logOutput).toContain("create_review");
  });

  it("outputs JSON with --json flag", async () => {
    setupTwoRoleAgent();
    await runPermissions(tmpDir, "@test/agent-ops", { json: true });

    expect(exitSpy).not.toHaveBeenCalledWith(1);

    const logOutput = logSpy.mock.calls.flat().join("\n");
    const parsed = JSON.parse(logOutput);

    // Per-role permissions
    expect(parsed.roles["@test/role-issue-manager"]).toBeDefined();
    expect(parsed.roles["@test/role-pr-reviewer"]).toBeDefined();
    expect(parsed.roles["@test/role-issue-manager"]["@test/app-github"].allow).toContain("create_issue");

    // Proxy-level toolFilters
    expect(parsed.toolFilters["@test/app-github"]).toBeDefined();
    expect(parsed.toolFilters["@test/app-github"].mode).toBe("allow");
    const unionList = parsed.toolFilters["@test/app-github"].list;
    expect(unionList).toContain("create_issue");
    expect(unionList).toContain("get_pr");
    expect(unionList).toContain("create_review");
  });

  it("exits 1 when agent is not found", async () => {
    await runPermissions(tmpDir, "@test/nonexistent", {});

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("Permissions failed");
  });
});
