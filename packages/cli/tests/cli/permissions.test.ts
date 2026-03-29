import { type MockInstance, describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { program } from "../../src/cli/index.js";
import { runPermissions } from "../../src/cli/commands/permissions.js";

describe("CLI permissions command", () => {
  const permsCmd = program.commands.find((cmd) => cmd.name() === "permissions");

  it("has the permissions command registered", () => {
    expect(permsCmd).toBeDefined();
    if (permsCmd) {
      expect(permsCmd.description()).toContain("permission");
    }
  });

  it("permissions command accepts a role argument", () => {
    expect(permsCmd).toBeDefined();
    if (permsCmd) {
      const args = permsCmd.registeredArguments;
      expect(args).toHaveLength(1);
      expect(args[0].name()).toBe("role");
      expect(args[0].required).toBe(true);
    }
  });

  it("permissions command has --json option", () => {
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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mason-perms-test-"));
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeRole(name: string, frontmatterYaml: string, body = "Role instructions."): void {
    const roleDir = path.join(tmpDir, ".mason", "roles", name);
    fs.mkdirSync(roleDir, { recursive: true });
    const content = `---\n${frontmatterYaml}\n---\n\n${body}\n`;
    fs.writeFileSync(path.join(roleDir, "ROLE.md"), content);
  }

  function setupRoleWithPermissions(): void {
    writeRole("issue-manager", `name: issue-manager
description: "Manages GitHub issues"
version: "1.0.0"
mcp:
  - name: "@test/app-github"
    transport: stdio
    command: npx
    args: ["-y", "@modelcontextprotocol/server-github"]
    tools:
      allow: ["create_issue", "list_repos", "add_label"]
      deny: ["get_pr"]`);
  }

  it("displays per-role permission breakdown", async () => {
    setupRoleWithPermissions();
    await runPermissions(tmpDir, "issue-manager", {});

    expect(exitSpy).not.toHaveBeenCalledWith(1);

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("Role: issue-manager");
    expect(logOutput).toContain("create_issue");
  });

  it("displays deny list when present", async () => {
    setupRoleWithPermissions();
    await runPermissions(tmpDir, "issue-manager", {});

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("deny:");
    expect(logOutput).toContain("get_pr");
  });

  it("displays proxy-level toolFilter union", async () => {
    setupRoleWithPermissions();
    await runPermissions(tmpDir, "issue-manager", {});

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("Proxy toolFilter");
    expect(logOutput).toContain("create_issue");
    expect(logOutput).toContain("list_repos");
    expect(logOutput).toContain("add_label");
  });

  it("outputs JSON with --json flag", async () => {
    setupRoleWithPermissions();
    await runPermissions(tmpDir, "issue-manager", { json: true });

    expect(exitSpy).not.toHaveBeenCalledWith(1);

    const logOutput = logSpy.mock.calls.flat().join("\n");
    const parsed = JSON.parse(logOutput);

    // Per-role permissions
    expect(parsed.roles["issue-manager"]).toBeDefined();
    expect(parsed.roles["issue-manager"]["@test/app-github"].allow).toContain("create_issue");

    // Proxy-level toolFilters
    expect(parsed.toolFilters["@test/app-github"]).toBeDefined();
    expect(parsed.toolFilters["@test/app-github"].mode).toBe("allow");
    const unionList = parsed.toolFilters["@test/app-github"].list;
    expect(unionList).toContain("create_issue");
    expect(unionList).toContain("list_repos");
    expect(unionList).toContain("add_label");
  });

  it("exits 1 when role is not found", async () => {
    await runPermissions(tmpDir, "nonexistent", {});

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("Permissions failed");
  });
});
