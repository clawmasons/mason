import { type MockInstance, describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { program } from "../../src/cli/index.js";
import { runValidate } from "../../src/cli/commands/validate.js";

describe("CLI validate command", () => {
  const validateCmd = program.commands.find((cmd) => cmd.name() === "validate");

  it("has the validate command registered", () => {
    expect(validateCmd).toBeDefined();
    if (validateCmd) {
      expect(validateCmd.description()).toContain("Validate");
    }
  });

  it("validate command has --role option", () => {
    expect(validateCmd).toBeDefined();
    if (validateCmd) {
      const roleOption = validateCmd.options.find((opt) => opt.long === "--role");
      expect(roleOption).toBeDefined();
    }
  });

  it("validate command has --json option", () => {
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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mason-validate-test-"));
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeRoleMd(roleName: string, frontmatter: string, body: string): void {
    const roleDir = path.join(tmpDir, ".mason", "roles", roleName);
    fs.mkdirSync(roleDir, { recursive: true });
    fs.writeFileSync(
      path.join(roleDir, "ROLE.md"),
      `---\n${frontmatter}\n---\n\n${body}`,
    );
  }

  // ── Role-based validation ──────────────────────────────────────────────

  it("validates a local role successfully", async () => {
    writeRoleMd("test-role", `name: test-role\ndescription: A test role\ntasks: []\nskills: []`, "You are a test role.");

    await runValidate(tmpDir, "test-role", {});

    expect(exitSpy).toHaveBeenCalledWith(0);
    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("valid");
  });

  it("outputs JSON for valid role with --json flag", async () => {
    writeRoleMd("test-role", `name: test-role\ndescription: A test role\ntasks: []\nskills: []`, "You are a test role.");

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

  it("exits 1 when role is not found", async () => {
    await runValidate(tmpDir, "nonexistent", {});

    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
