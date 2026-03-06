/**
 * End-to-End Integration Test — Install Flow (Local tgz)
 *
 * Validates the complete chapter packaging pipeline using only local .tgz files:
 *   npm pack -> npm install tgz -> chapter init -> chapter validate -> chapter list -> chapter install
 *
 * This test proves that the entire user journey works without any npm registry access.
 * It exercises all chapter-packaging PRD changes:
 *   - chapter-core package (Change 1)
 *   - Discovery enhancement (Change 2)
 *   - Template system (Change 3)
 *   - Simplified Dockerfile (Change 4)
 *   - Example removal (Change 5)
 *
 * PRD refs: chapter-members PRD Section 2 (Measurable Outcomes)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ── Constants ──────────────────────────────────────────────────────────

const CHAPTER_ROOT = join(import.meta.dirname, "..", "..");
const CHAPTER_CORE_DIR = join(CHAPTER_ROOT, "chapter-core");
const TIMEOUT = 120_000;

// ── Shared State ───────────────────────────────────────────────────────

let tmpDir: string;
let chapterTgzPath: string;
let chapterCoreTgzPath: string;
let projectScope: string;

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Run a command and return stdout. Throws on non-zero exit.
 */
function run(cmd: string, args: string[], cwd: string): string {
  return execFileSync(cmd, args, {
    cwd,
    encoding: "utf-8",
    timeout: 60_000,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

/**
 * Run the locally-installed chapter CLI via node_modules/.bin/chapter.
 * Avoids npx, which can resolve to the wrong package on the registry.
 */
function chapterCli(args: string[], cwd: string): string {
  const chapterBin = join(cwd, "node_modules", ".bin", "chapter");
  return run(chapterBin, args, cwd);
}

// ── Setup / Teardown ───────────────────────────────────────────────────

beforeAll(() => {
  // 1. Build chapter
  run("npm", ["run", "build"], CHAPTER_ROOT);

  // 2. Pack @clawmasons/chapter
  const chapterPackJson = run("npm", ["pack", "--json"], CHAPTER_ROOT);
  const chapterPackResult = JSON.parse(chapterPackJson) as Array<{ filename: string }>;
  const chapterFilename = chapterPackResult[0]!.filename;
  chapterTgzPath = join(CHAPTER_ROOT, chapterFilename);

  // 3. Pack @clawmasons/chapter-core
  const corePackJson = run("npm", ["pack", "--json"], CHAPTER_CORE_DIR);
  const corePackResult = JSON.parse(corePackJson) as Array<{ filename: string }>;
  const coreFilename = corePackResult[0]!.filename;
  chapterCoreTgzPath = join(CHAPTER_CORE_DIR, coreFilename);

  // 4. Create temp directory
  tmpDir = mkdtempSync(join(tmpdir(), "test-chapter-"));
  projectScope = tmpDir.split("/").pop()!;

  // Verify tgz files exist
  expect(existsSync(chapterTgzPath)).toBe(true);
  expect(existsSync(chapterCoreTgzPath)).toBe(true);
}, TIMEOUT);

afterAll(() => {
  // Clean up temp directory
  try {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  } catch {
    /* ignore cleanup errors */
  }

  // Clean up tgz files (they're gitignored but tidy up)
  try {
    if (chapterTgzPath && existsSync(chapterTgzPath)) rmSync(chapterTgzPath);
  } catch {
    /* ignore */
  }
  try {
    if (chapterCoreTgzPath && existsSync(chapterCoreTgzPath)) rmSync(chapterCoreTgzPath);
  } catch {
    /* ignore */
  }
});

// ── Tests ──────────────────────────────────────────────────────────────

describe("E2E Install Flow (Local tgz)", () => {
  // Tests run sequentially within a describe — each step depends on the previous one.

  it("step 1: installs chapter from tgz and runs chapter init", () => {
    // Initialize a bare package.json so npm install works
    run("npm", ["init", "-y"], tmpDir);

    // Install chapter tgz to get the CLI
    run("npm", ["install", chapterTgzPath], tmpDir);

    // Verify chapter CLI is available
    expect(existsSync(join(tmpDir, "node_modules", ".bin", "chapter"))).toBe(true);

    // Run chapter init --template note-taker
    // This will copy template files (including package.json with @clawmasons/chapter-core dep),
    // create .chapter/ scaffold, and attempt npm install. The npm install inside init
    // may warn about @clawmasons/chapter-core not being on the registry — that's expected
    // for local tgz testing. The template files are still copied correctly.
    chapterCli(["init", "--template", "note-taker"], tmpDir);

    // Verify scaffold was created
    expect(existsSync(join(tmpDir, ".chapter"))).toBe(true);
    expect(existsSync(join(tmpDir, ".chapter", "config.json"))).toBe(true);

    // Verify template files were copied (still uses members/ directory from template)
    expect(existsSync(join(tmpDir, "members", "note-taker", "package.json"))).toBe(true);
    expect(existsSync(join(tmpDir, "roles", "writer", "package.json"))).toBe(true);

    // Verify member package.json has correct project scope
    const memberPkg = JSON.parse(
      readFileSync(join(tmpDir, "members", "note-taker", "package.json"), "utf-8"),
    ) as { name: string };
    expect(memberPkg.name).toBe(`@${projectScope}/member-note-taker`);

    // Verify role package.json has correct project scope
    const rolePkg = JSON.parse(
      readFileSync(join(tmpDir, "roles", "writer", "package.json"), "utf-8"),
    ) as { name: string };
    expect(rolePkg.name).toBe(`@${projectScope}/role-writer`);
  }, TIMEOUT);

  it("step 2: installs both tgz packages for full dependency resolution", () => {
    // After chapter init, the template's package.json replaced the original.
    // Install both chapter and chapter-core tgz files to populate node_modules
    // with all required packages for discovery and CLI usage.
    run("npm", ["install", chapterTgzPath, chapterCoreTgzPath], tmpDir);

    // Verify both packages are installed
    expect(existsSync(join(tmpDir, "node_modules", "@clawmasons", "chapter"))).toBe(true);
    expect(existsSync(join(tmpDir, "node_modules", "@clawmasons", "chapter-core"))).toBe(true);

    // Verify chapter CLI binary is linked
    expect(existsSync(join(tmpDir, "node_modules", ".bin", "chapter"))).toBe(true);

    // Verify chapter-core contains expected component structure
    expect(
      existsSync(join(tmpDir, "node_modules", "@clawmasons", "chapter-core", "apps", "filesystem", "package.json")),
    ).toBe(true);
    expect(
      existsSync(join(tmpDir, "node_modules", "@clawmasons", "chapter-core", "tasks", "take-notes", "package.json")),
    ).toBe(true);
    expect(
      existsSync(join(tmpDir, "node_modules", "@clawmasons", "chapter-core", "skills", "markdown-conventions", "package.json")),
    ).toBe(true);
  }, TIMEOUT);

  it("step 3: chapter validate confirms agent graph is valid", () => {
    const agentName = `@${projectScope}/member-note-taker`;
    const output = chapterCli(["validate", agentName], tmpDir);
    expect(output).toContain("is valid");
  }, TIMEOUT);

  it("step 4: chapter list shows complete agent dependency tree", () => {
    const output = chapterCli(["list", "--json"], tmpDir);
    const agents = JSON.parse(output) as Array<{
      name: string;
      roles: Array<{
        name: string;
        tasks: Array<{ name: string }>;
        skills: Array<{ name: string }>;
        apps: Array<{ name: string }>;
      }>;
    }>;

    // Should have at least one agent (may also pick up chapter-core's member)
    expect(agents.length).toBeGreaterThanOrEqual(1);

    // Find our template agent (local scope takes precedence)
    const agent = agents.find((a) => a.name === `@${projectScope}/member-note-taker`);
    expect(agent).toBeDefined();

    // Agent should have the writer role
    const role = agent!.roles.find((r) => r.name === `@${projectScope}/role-writer`);
    expect(role).toBeDefined();

    // Role should reference chapter-core components
    expect(role!.tasks.some((t) => t.name === "@clawmasons/task-take-notes")).toBe(true);
    expect(role!.skills.some((s) => s.name === "@clawmasons/skill-markdown-conventions")).toBe(true);
    expect(role!.apps.some((a) => a.name === "@clawmasons/app-filesystem")).toBe(true);
  }, TIMEOUT);

  it("step 5: chapter install generates single-stage Dockerfile", () => {
    const agentName = `@${projectScope}/member-note-taker`;
    chapterCli(["install", agentName], tmpDir);

    // Verify output directory was created
    const installDir = join(tmpDir, ".chapter", "members", "note-taker");
    expect(existsSync(installDir)).toBe(true);

    // Verify Dockerfile exists and is single-stage
    const dockerfilePath = join(installDir, "chapter-proxy", "Dockerfile");
    expect(existsSync(dockerfilePath)).toBe(true);

    const dockerfile = readFileSync(dockerfilePath, "utf-8");
    expect(dockerfile).not.toContain("AS builder");
    expect(dockerfile).toContain("FROM node:22-slim");
    expect(dockerfile).toContain(`CMD ["proxy", "--member", "${agentName}"]`);

    // Verify docker-compose.yml exists
    expect(existsSync(join(installDir, "docker-compose.yml"))).toBe(true);

    // Verify chapter proxy build context has pre-built artifacts (not source)
    expect(existsSync(join(installDir, "chapter-proxy", "chapter", "dist"))).toBe(true);
    expect(existsSync(join(installDir, "chapter-proxy", "chapter", "bin"))).toBe(true);
    expect(existsSync(join(installDir, "chapter-proxy", "chapter", "package.json"))).toBe(true);
  }, TIMEOUT);
});
