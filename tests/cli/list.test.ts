import { type MockInstance, describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { program } from "../../src/cli/index.js";
import { runList } from "../../src/cli/commands/list.js";

describe("CLI list command", () => {
  it("has the list command registered", () => {
    const listCmd = program.commands.find((cmd) => cmd.name() === "list");
    expect(listCmd).toBeDefined();
    if (listCmd) {
      expect(listCmd.description()).toContain("List");
    }
  });

  it("list command has --json option", () => {
    const listCmd = program.commands.find((cmd) => cmd.name() === "list");
    expect(listCmd).toBeDefined();
    if (listCmd) {
      const jsonOption = listCmd.options.find((opt) => opt.long === "--json");
      expect(jsonOption).toBeDefined();
    }
  });
});

describe("runList", () => {
  let tmpDir: string;
  let exitSpy: MockInstance;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-list-test-"));
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
        type: "agent",
        runtimes: ["claude-code"],
        roles: ["@test/role-manager"],
      },
    });
  }

  it("prints tree for a single agent", async () => {
    setupValidAgent();
    await runList(tmpDir, {});

    expect(exitSpy).not.toHaveBeenCalledWith(1);

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("@test/agent-ops@1.0.0");
    expect(logOutput).toContain("role: manager@1.0.0");
    expect(logOutput).toContain("task: triage@1.0.0");
    expect(logOutput).toContain("app: github@1.0.0");
    expect(logOutput).toContain("skill: labeling@1.0.0");
  });

  it("prints trees for multiple agents", async () => {
    setupValidAgent();

    // Add a second agent
    writePackage(path.join(tmpDir, "agents", "ops2"), {
      name: "@test/agent-ops2",
      version: "2.0.0",
      chapter: {
        type: "agent",
        runtimes: ["claude-code"],
        roles: ["@test/role-manager"],
      },
    });

    await runList(tmpDir, {});

    expect(exitSpy).not.toHaveBeenCalledWith(1);

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("@test/agent-ops@1.0.0");
    expect(logOutput).toContain("@test/agent-ops2@2.0.0");
  });

  it("exits 1 when no agents are found", async () => {
    await runList(tmpDir, {});

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("No agents found");
  });

  it("outputs JSON array with --json flag", async () => {
    setupValidAgent();
    await runList(tmpDir, { json: true });

    expect(exitSpy).not.toHaveBeenCalledWith(1);

    const logOutput = logSpy.mock.calls.flat().join("\n");
    const parsed = JSON.parse(logOutput);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe("@test/agent-ops");
    expect(parsed[0].roles).toHaveLength(1);
  });
});
