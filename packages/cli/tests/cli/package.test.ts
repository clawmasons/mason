import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, readFile, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runPackage } from "../../src/cli/commands/package.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testDir: string;

beforeEach(async () => {
  testDir = join(
    tmpdir(),
    `pkg-cmd-test-${Date.now()}-${Math.random().toString(36).substring(7)}`,
  );
  await mkdir(testDir, { recursive: true });
  // Prevent real npm calls from executing
  vi.mock("node:child_process", () => ({
    spawnSync: vi.fn().mockReturnValue({ status: 0 }),
  }));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(testDir, { recursive: true, force: true });
});

/** Create a role in .mason/roles/<name>/ROLE.md */
async function createMasonRole(opts: {
  name: string;
  description?: string;
  tasks?: string[];
  skills?: string[];
  sources?: string[];
  body?: string;
  userPkgJson?: Record<string, unknown>;
}): Promise<string> {
  const roleDir = join(testDir, ".mason", "roles", opts.name);
  await mkdir(roleDir, { recursive: true });

  const taskLines = (opts.tasks ?? []).map((t) => `  - ${t}`).join("\n");
  const skillLines = (opts.skills ?? []).map((s) => `  - ${s}`).join("\n");
  const sourceLines = (opts.sources ?? []).map((s) => `  - ${s}`).join("\n");

  const frontmatterParts = [
    `name: ${opts.name}`,
    `description: ${opts.description ?? `${opts.name} role`}`,
  ];
  if (taskLines) frontmatterParts.push(`tasks:\n${taskLines}`);
  if (skillLines) frontmatterParts.push(`skills:\n${skillLines}`);
  if (sourceLines) frontmatterParts.push(`sources:\n${sourceLines}`);

  const roleMd = `---\n${frontmatterParts.join("\n")}\n---\n\n${opts.body ?? `Instructions for ${opts.name}.`}`;
  await writeFile(join(roleDir, "ROLE.md"), roleMd);

  if (opts.userPkgJson) {
    await writeFile(
      join(roleDir, "package.json"),
      JSON.stringify(opts.userPkgJson, null, 2) + "\n",
    );
  }

  return roleDir;
}

/** Create a task file in a source directory */
async function createTaskFile(
  sourceDir: string,
  tasksSubdir: string,
  taskName: string,
  content = `# ${taskName}\n\nTask content.`,
): Promise<void> {
  const dir = join(testDir, sourceDir, tasksSubdir);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${taskName}.md`), content);
}

/** Create a skill file in a source directory */
async function createSkillFile(
  sourceDir: string,
  skillName: string,
  content = `# ${skillName}\n\nSkill content.`,
): Promise<void> {
  const dir = join(testDir, sourceDir, "skills");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${skillName}.md`), content);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runPackage — role resolution", () => {
  it("proceeds when role exists at .mason/roles/<name>/ROLE.md", async () => {
    await createMasonRole({ name: "my-role" });
    // Mock spawnSync to avoid real npm calls
    const { spawnSync } = await import("node:child_process");
    vi.mocked(spawnSync).mockReturnValue({ status: 0, pid: 1, output: [], stdout: Buffer.from(""), stderr: Buffer.from(""), signal: null });

    // Should not throw (npm calls are mocked)
    await runPackage(testDir, "my-role");

    const buildDir = join(testDir, ".mason", "roles", "my-role", "build");
    expect(existsSync(buildDir)).toBe(true);
  });

  it("exits with error when role not found at canonical location", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(runPackage(testDir, "missing-role")).rejects.toThrow();

    const errorOutput = consoleErrorSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(errorOutput).toContain("missing-role");
    expect(errorOutput).toContain(".mason/roles/missing-role/ROLE.md");

    exitSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});

describe("runPackage — ref validation", () => {
  it("reports unresolved task ref and writes no build files", async () => {
    await createMasonRole({
      name: "bad-role",
      tasks: ["missing-task"],
      sources: [".claude/"],
    });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(runPackage(testDir, "bad-role")).rejects.toThrow();

    const errorOutput = consoleErrorSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(errorOutput).toContain("missing-task");

    // Build directory should not be written
    const buildDir = join(testDir, ".mason", "roles", "bad-role", "build");
    expect(existsSync(join(buildDir, "ROLE.md"))).toBe(false);

    exitSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("reports all unresolved refs together (not just the first)", async () => {
    await createMasonRole({
      name: "multi-bad",
      tasks: ["missing-task-1", "missing-task-2"],
      skills: ["missing-skill"],
      sources: [".claude/"],
    });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(runPackage(testDir, "multi-bad")).rejects.toThrow();

    const errorOutput = consoleErrorSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(errorOutput).toContain("missing-task-1");
    expect(errorOutput).toContain("missing-task-2");
    expect(errorOutput).toContain("missing-skill");

    exitSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});

describe("runPackage — dialect-aware scanning", () => {
  it("resolves tasks from .claude/commands/ for Claude dialect source", async () => {
    await createMasonRole({
      name: "claude-role",
      tasks: ["take-notes"],
      sources: [".claude/"],
    });
    await createTaskFile(".claude", "commands", "take-notes");

    const { spawnSync } = await import("node:child_process");
    vi.mocked(spawnSync).mockReturnValue({ status: 0, pid: 1, output: [], stdout: Buffer.from(""), stderr: Buffer.from(""), signal: null });

    await runPackage(testDir, "claude-role");

    const taskFile = join(testDir, ".mason", "roles", "claude-role", "build", "tasks", "take-notes.md");
    expect(existsSync(taskFile)).toBe(true);
  });

  it("resolves skills from .claude/skills/ for Claude dialect source", async () => {
    await createMasonRole({
      name: "skilled-role",
      skills: ["markdown-conventions"],
      sources: [".claude/"],
    });
    await createSkillFile(".claude", "markdown-conventions");

    const { spawnSync } = await import("node:child_process");
    vi.mocked(spawnSync).mockReturnValue({ status: 0, pid: 1, output: [], stdout: Buffer.from(""), stderr: Buffer.from(""), signal: null });

    await runPackage(testDir, "skilled-role");

    const skillFile = join(testDir, ".mason", "roles", "skilled-role", "build", "skills", "markdown-conventions.md");
    expect(existsSync(skillFile)).toBe(true);
  });
});

describe("runPackage — build directory structure", () => {
  it("creates build dir with ROLE.md and task/skill subdirs", async () => {
    await createMasonRole({
      name: "full-role",
      tasks: ["create-prd"],
      skills: ["prd-writing"],
      sources: [".claude/"],
    });
    await createTaskFile(".claude", "commands", "create-prd");
    await createSkillFile(".claude", "prd-writing");

    const { spawnSync } = await import("node:child_process");
    vi.mocked(spawnSync).mockReturnValue({ status: 0, pid: 1, output: [], stdout: Buffer.from(""), stderr: Buffer.from(""), signal: null });

    await runPackage(testDir, "full-role");

    const buildDir = join(testDir, ".mason", "roles", "full-role", "build");
    expect(existsSync(join(buildDir, "ROLE.md"))).toBe(true);
    expect(existsSync(join(buildDir, "tasks", "create-prd.md"))).toBe(true);
    expect(existsSync(join(buildDir, "skills", "prd-writing.md"))).toBe(true);
  });
});

describe("runPackage — package.json generation", () => {
  it("generates package.json from ROLE.md metadata when no user file exists", async () => {
    await createMasonRole({ name: "bare-role", description: "A bare role" });

    const { spawnSync } = await import("node:child_process");
    vi.mocked(spawnSync).mockReturnValue({ status: 0, pid: 1, output: [], stdout: Buffer.from(""), stderr: Buffer.from(""), signal: null });

    await runPackage(testDir, "bare-role");

    const pkgJson = JSON.parse(
      await readFile(
        join(testDir, ".mason", "roles", "bare-role", "build", "package.json"),
        "utf-8",
      ),
    ) as Record<string, unknown>;

    expect(pkgJson.name).toBe("bare-role");
    expect(pkgJson.description).toBe("A bare role");
    expect((pkgJson.chapter as Record<string, unknown>).type).toBe("role");
  });

  it("uses `package` metadata field as npm package name when specified", async () => {
    const roleDir = join(testDir, ".mason", "roles", "scoped-role");
    await mkdir(roleDir, { recursive: true });
    const roleMd = `---\nname: scoped-role\ndescription: A scoped role\npackage: "@myorg/my-role"\n---\n\nInstructions.`;
    await writeFile(join(roleDir, "ROLE.md"), roleMd);

    const { spawnSync } = await import("node:child_process");
    vi.mocked(spawnSync).mockReturnValue({ status: 0, pid: 1, output: [], stdout: Buffer.from(""), stderr: Buffer.from(""), signal: null });

    await runPackage(testDir, "scoped-role");

    const pkgJson = JSON.parse(
      await readFile(
        join(testDir, ".mason", "roles", "scoped-role", "build", "package.json"),
        "utf-8",
      ),
    ) as Record<string, unknown>;

    expect(pkgJson.name).toBe("@myorg/my-role");
  });

  it("merges user-supplied package.json preserving devDependencies", async () => {
    await createMasonRole({
      name: "custom-role",
      userPkgJson: {
        devDependencies: { typescript: "^5.0.0" },
        scripts: { build: "tsc" },
      },
    });

    const { spawnSync } = await import("node:child_process");
    vi.mocked(spawnSync).mockReturnValue({ status: 0, pid: 1, output: [], stdout: Buffer.from(""), stderr: Buffer.from(""), signal: null });

    await runPackage(testDir, "custom-role");

    const pkgJson = JSON.parse(
      await readFile(
        join(testDir, ".mason", "roles", "custom-role", "build", "package.json"),
        "utf-8",
      ),
    ) as Record<string, unknown>;

    expect((pkgJson.chapter as Record<string, unknown>).type).toBe("role");
    expect(pkgJson.devDependencies).toEqual({ typescript: "^5.0.0" });
    expect((pkgJson.scripts as Record<string, string>).build).toBe("tsc");
  });
});

describe("runPackage — npm lifecycle", () => {
  it("skips npm run build when no build script in package.json", async () => {
    await createMasonRole({ name: "no-build-role" });

    const { spawnSync } = (await import("node:child_process")) as {
      spawnSync: ReturnType<typeof vi.fn>;
    };
    vi.mocked(spawnSync).mockReturnValue({ status: 0, pid: 1, output: [], stdout: Buffer.from(""), stderr: Buffer.from(""), signal: null });

    await runPackage(testDir, "no-build-role");

    const calls = vi.mocked(spawnSync).mock.calls.map((c) => c[1] as string[]);
    const buildCall = calls.find((args) => args.includes("build"));
    expect(buildCall).toBeUndefined();
  });
});
