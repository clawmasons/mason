import { type MockInstance, describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { program } from "../../src/cli/index.js";
import { runList } from "../../src/cli/commands/list.js";

describe("CLI list command", () => {
  const chapterCmd = program.commands.find((cmd) => cmd.name() === "chapter");

  it("has the list command registered under chapter", () => {
    expect(chapterCmd).toBeDefined();
    const listCmd = chapterCmd!.commands.find((cmd) => cmd.name() === "list");
    expect(listCmd).toBeDefined();
    if (listCmd) {
      expect(listCmd.description()).toContain("roles");
    }
  });

  it("list command has --json option", () => {
    const listCmd = chapterCmd!.commands.find((cmd) => cmd.name() === "list");
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

  function writeRoleMd(agentDir: string, roleName: string, frontmatter: string, body: string): void {
    const roleDir = path.join(tmpDir, `.${agentDir}`, "roles", roleName);
    fs.mkdirSync(roleDir, { recursive: true });
    fs.writeFileSync(
      path.join(roleDir, "ROLE.md"),
      `---\n${frontmatter}\n---\n\n${body}`,
    );
  }

  it("shows roles from local ROLE.md files", async () => {
    writeRoleMd("claude", "create-prd", `name: create-prd\ndescription: Creates PRDs\ncommands: []\nskills: []`, "You are a PRD author.");

    await runList(tmpDir, {});

    expect(exitSpy).not.toHaveBeenCalledWith(1);
    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("create-prd");
    expect(logOutput).toContain("Creates PRDs");
  });

  it("shows multiple roles from different agent directories", async () => {
    writeRoleMd("claude", "create-prd", `name: create-prd\ndescription: Creates PRDs\ncommands: []\nskills: []`, "PRD author.");
    writeRoleMd("codex", "code-review", `name: code-review\ndescription: Reviews code\ninstructions: []\nskills: []`, "Code reviewer.");

    await runList(tmpDir, {});

    expect(exitSpy).not.toHaveBeenCalledWith(1);
    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("create-prd");
    expect(logOutput).toContain("code-review");
  });

  it("exits 1 when no roles are found", async () => {
    await runList(tmpDir, {});

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("No roles found");
  });

  it("outputs JSON array with --json flag", async () => {
    writeRoleMd("claude", "create-prd", `name: create-prd\ndescription: Creates PRDs\ncommands: []\nskills: []`, "You are a PRD author.");

    await runList(tmpDir, { json: true });

    expect(exitSpy).not.toHaveBeenCalledWith(1);

    const logOutput = logSpy.mock.calls.flat().join("\n");
    const parsed = JSON.parse(logOutput);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].metadata.name).toBe("create-prd");
  });

  it("shows source type for local roles", async () => {
    writeRoleMd("claude", "create-prd", `name: create-prd\ndescription: Creates PRDs\ncommands: []\nskills: []`, "PRD author.");

    await runList(tmpDir, {});

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("local");
  });
});
