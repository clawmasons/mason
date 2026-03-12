import { type MockInstance, describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { program } from "../../src/cli/index.js";
import { runValidate } from "../../src/cli/commands/validate.js";

describe("CLI validate command", () => {
  const chapterCmd = program.commands.find((cmd) => cmd.name() === "chapter");

  it("has the validate command registered under chapter", () => {
    expect(chapterCmd).toBeDefined();
    const validateCmd = chapterCmd!.commands.find((cmd) => cmd.name() === "validate");
    expect(validateCmd).toBeDefined();
    if (validateCmd) {
      expect(validateCmd.description()).toContain("Validate");
    }
  });

  it("validate command has --role option", () => {
    const validateCmd = chapterCmd!.commands.find((cmd) => cmd.name() === "validate");
    expect(validateCmd).toBeDefined();
    if (validateCmd) {
      const roleOption = validateCmd.options.find((opt) => opt.long === "--role");
      expect(roleOption).toBeDefined();
    }
  });

  it("validate command has --json option", () => {
    const validateCmd = chapterCmd!.commands.find((cmd) => cmd.name() === "validate");
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

  function writeRoleMd(agentDir: string, roleName: string, frontmatter: string, body: string): void {
    const roleDir = path.join(tmpDir, `.${agentDir}`, "roles", roleName);
    fs.mkdirSync(roleDir, { recursive: true });
    fs.writeFileSync(
      path.join(roleDir, "ROLE.md"),
      `---\n${frontmatter}\n---\n\n${body}`,
    );
  }

  function writePackage(dir: string, pkg: Record<string, unknown>): void {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2));
  }

  // ── Role-based validation ──────────────────────────────────────────────

  it("validates a local role successfully", async () => {
    writeRoleMd("claude", "test-role", `name: test-role\ndescription: A test role\ncommands: []\nskills: []`, "You are a test role.");

    await runValidate(tmpDir, "test-role", {});

    expect(exitSpy).toHaveBeenCalledWith(0);
    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("valid");
  });

  it("outputs JSON for valid role with --json flag", async () => {
    writeRoleMd("claude", "test-role", `name: test-role\ndescription: A test role\ncommands: []\nskills: []`, "You are a test role.");

    await runValidate(tmpDir, "test-role", { json: true });

    expect(exitSpy).toHaveBeenCalledWith(0);
    const logOutput = logSpy.mock.calls.flat().join("\n");
    const parsed = JSON.parse(logOutput);
    expect(parsed.valid).toBe(true);
  });

  it("provides install instructions for missing packaged role", async () => {
    await runValidate(tmpDir, "@acme/role-create-prd", {});

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("npm install --save-dev @acme/role-create-prd");
  });

  it("provides install instructions in JSON for missing packaged role", async () => {
    await runValidate(tmpDir, "@acme/role-create-prd", { json: true });

    expect(exitSpy).toHaveBeenCalledWith(1);
    const logOutput = logSpy.mock.calls.flat().join("\n");
    const parsed = JSON.parse(logOutput);
    expect(parsed.valid).toBe(false);
    expect(parsed.errors[0].message).toContain("npm install --save-dev @acme/role-create-prd");
  });

  // ── Agent-based validation (backward compat) ──────────────────────────

  it("falls back to agent validation for agent packages", async () => {
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

    writePackage(path.join(tmpDir, "roles", "manager"), {
      name: "@test/role-manager",
      version: "1.0.0",
      chapter: {
        type: "role",
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
        name: "Ops",
        slug: "ops",
        runtimes: ["claude-code"],
        roles: ["@test/role-manager"],
      },
    });

    await runValidate(tmpDir, "@test/agent-ops", {});

    expect(exitSpy).toHaveBeenCalledWith(0);
    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("valid");
  });

  it("exits 1 when neither role nor agent is found", async () => {
    await runValidate(tmpDir, "nonexistent", {});

    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
