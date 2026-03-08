/**
 * End-to-End Integration Test — Full Chapter Workflow (Local tgz)
 *
 * Validates the complete chapter lifecycle using only local .tgz files:
 *   npm pack -> npm install tgz -> chapter init -> chapter validate -> chapter list
 *   -> chapter install -> verify registry -> verify dirs -> disable -> run guard
 *   -> enable -> no-forge check
 *
 * This test proves that the entire user journey works without any npm registry access.
 * It exercises all chapter-members PRD changes:
 *   - Rename & rebrand (Changes 1-4)
 *   - Member model (Change 5)
 *   - Per-member dirs (Change 6)
 *   - Members registry (Change 7)
 *   - Enable/disable (Change 8)
 *   - Templates (Change 9)
 *   - Terminology (Change 10)
 *   - E2E validation (Change 11)
 *
 * PRD refs: chapter-members PRD Phase 5 (End-to-End Validation)
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readAgentsRegistry, getAgent } from "../../src/registry/members.js";
import { runDisable } from "../../src/cli/commands/disable.js";
import { runEnable } from "../../src/cli/commands/enable.js";

// ── Constants ──────────────────────────────────────────────────────────

const CHAPTER_ROOT = join(import.meta.dirname, "..", "..");
const TIMEOUT = 120_000;

// ── Shared State ───────────────────────────────────────────────────────

let tmpDir: string;
let chapterTgzPath: string;
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

  // 3. Create temp directory
  tmpDir = mkdtempSync(join(tmpdir(), "test-chapter-"));
  projectScope = "e2e.test";

  // Verify tgz file exists
  expect(existsSync(chapterTgzPath)).toBe(true);
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

    // Run chapter init --template note-taker --name e2e.test
    // This will copy template files (all components are inline in the template),
    // create .clawmasons/ scaffold, and run npm install.
    chapterCli(["init", "--template", "note-taker", "--name", "e2e.test"], tmpDir);

    // Verify scaffold was created
    expect(existsSync(join(tmpDir, ".clawmasons"))).toBe(true);
    expect(existsSync(join(tmpDir, ".clawmasons", "chapter.json"))).toBe(true);

    // Verify template files were copied (still uses members/ directory from template)
    expect(existsSync(join(tmpDir, "agents", "note-taker", "package.json"))).toBe(true);
    expect(existsSync(join(tmpDir, "roles", "writer", "package.json"))).toBe(true);

    // Verify member package.json has correct project scope
    const memberPkg = JSON.parse(
      readFileSync(join(tmpDir, "agents", "note-taker", "package.json"), "utf-8"),
    ) as { name: string };
    expect(memberPkg.name).toBe(`@${projectScope}/agent-note-taker`);

    // Verify role package.json has correct project scope
    const rolePkg = JSON.parse(
      readFileSync(join(tmpDir, "roles", "writer", "package.json"), "utf-8"),
    ) as { name: string };
    expect(rolePkg.name).toBe(`@${projectScope}/role-writer`);
  }, TIMEOUT);

  it("step 2: installs chapter tgz and verifies local template components", () => {
    // After chapter init, the template's package.json replaced the original.
    // Install chapter tgz to populate node_modules with the CLI.
    // All components (apps, tasks, skills) are now local workspace packages.
    run("npm", ["install", chapterTgzPath], tmpDir);

    // Verify chapter is installed
    expect(existsSync(join(tmpDir, "node_modules", "@clawmasons", "chapter"))).toBe(true);

    // Verify chapter CLI binary is linked
    expect(existsSync(join(tmpDir, "node_modules", ".bin", "chapter"))).toBe(true);

    // Verify template components exist as local workspace packages
    expect(existsSync(join(tmpDir, "apps", "filesystem", "package.json"))).toBe(true);
    expect(existsSync(join(tmpDir, "tasks", "take-notes", "package.json"))).toBe(true);
    expect(existsSync(join(tmpDir, "skills", "markdown-conventions", "package.json"))).toBe(true);
    expect(existsSync(join(tmpDir, "tasks", "take-notes", "prompts", "take-notes.md"))).toBe(true);
    expect(existsSync(join(tmpDir, "skills", "markdown-conventions", "SKILL.md"))).toBe(true);
  }, TIMEOUT);

  it("step 3: chapter validate confirms agent graph is valid", () => {
    const agentName = `@${projectScope}/agent-note-taker`;
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
    const agent = agents.find((a) => a.name === `@${projectScope}/agent-note-taker`);
    expect(agent).toBeDefined();

    // Agent should have the writer role
    const role = agent!.roles.find((r) => r.name === `@${projectScope}/role-writer`);
    expect(role).toBeDefined();

    // Role should reference local project-scoped components
    expect(role!.tasks.some((t) => t.name === `@${projectScope}/task-take-notes`)).toBe(true);
    expect(role!.skills.some((s) => s.name === `@${projectScope}/skill-markdown-conventions`)).toBe(true);
    expect(role!.apps.some((a) => a.name === `@${projectScope}/app-filesystem`)).toBe(true);
  }, TIMEOUT);

  it("step 5: chapter install generates single-stage Dockerfile", () => {
    const agentName = `@${projectScope}/agent-note-taker`;
    chapterCli(["install", agentName], tmpDir);

    // Verify output directory was created
    const installDir = join(tmpDir, ".chapter", "agents", "note-taker");
    expect(existsSync(installDir)).toBe(true);

    // Verify Dockerfile exists and is single-stage
    const dockerfilePath = join(installDir, "proxy", "Dockerfile");
    expect(existsSync(dockerfilePath)).toBe(true);

    const dockerfile = readFileSync(dockerfilePath, "utf-8");
    expect(dockerfile).not.toContain("AS builder");
    expect(dockerfile).toContain("FROM node:22-slim");
    expect(dockerfile).toContain(`CMD ["proxy", "--agent", "${agentName}"]`);

    // Verify docker-compose.yml exists
    expect(existsSync(join(installDir, "docker-compose.yml"))).toBe(true);

    // Verify log/ directory exists
    expect(existsSync(join(installDir, "log"))).toBe(true);

    // Verify proxy build context has pre-built artifacts (not source)
    expect(existsSync(join(installDir, "proxy", "chapter", "dist"))).toBe(true);
    expect(existsSync(join(installDir, "proxy", "chapter", "bin"))).toBe(true);
    expect(existsSync(join(installDir, "proxy", "chapter", "package.json"))).toBe(true);
  }, TIMEOUT);

  // ── New Steps: Registry, Enable/Disable, Forge-Remnant Checks ──────

  it("step 6: members registry is populated after install", () => {
    const chapterDir = join(tmpDir, ".chapter");

    // Verify agents.json exists
    expect(existsSync(join(chapterDir, "agents.json"))).toBe(true);

    // Read and validate registry
    const registry = readAgentsRegistry(chapterDir);
    const entry = registry.agents["note-taker"];

    expect(entry).toBeDefined();
    expect(entry!.status).toBe("enabled");
    
    expect(entry!.package).toBe(`@${projectScope}/agent-note-taker`);

    // Verify installedAt is a valid ISO 8601 timestamp
    expect(entry!.installedAt).toBeTruthy();
    const parsedDate = new Date(entry!.installedAt);
    expect(parsedDate.getTime()).not.toBeNaN();
  }, TIMEOUT);

  it("step 7: per-member directory structure is complete", () => {
    const installDir = join(tmpDir, ".chapter", "agents", "note-taker");

    // Activity log directory
    expect(existsSync(join(installDir, "log"))).toBe(true);

    // Proxy build context
    expect(existsSync(join(installDir, "proxy", "Dockerfile"))).toBe(true);
    expect(existsSync(join(installDir, "proxy", "chapter", "dist"))).toBe(true);
    expect(existsSync(join(installDir, "proxy", "chapter", "package.json"))).toBe(true);

    // Claude-code runtime workspace
    expect(existsSync(join(installDir, "claude-code", "workspace"))).toBe(true);
    expect(existsSync(join(installDir, "claude-code", "workspace", ".claude", "settings.json"))).toBe(true);
    expect(existsSync(join(installDir, "claude-code", "workspace", "AGENTS.md"))).toBe(true);
    expect(existsSync(join(installDir, "claude-code", "Dockerfile"))).toBe(true);

    // Docker artifacts
    expect(existsSync(join(installDir, "docker-compose.yml"))).toBe(true);
    expect(existsSync(join(installDir, ".env"))).toBe(true);
    expect(existsSync(join(installDir, "chapter.lock.json"))).toBe(true);
  }, TIMEOUT);

  it("step 8: chapter disable updates registry status", () => {
    // Suppress console output during disable
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    runDisable(tmpDir, "@note-taker");

    logSpy.mockRestore();

    // Verify the registry was updated
    const chapterDir = join(tmpDir, ".chapter");
    const registry = readAgentsRegistry(chapterDir);
    const entry = registry.agents["note-taker"];

    expect(entry).toBeDefined();
    expect(entry!.status).toBe("disabled");

    // Other fields should be preserved
    
    expect(entry!.package).toBe(`@${projectScope}/agent-note-taker`);
    expect(entry!.installedAt).toBeTruthy();
  }, TIMEOUT);

  it("step 9: disabled member is blocked from running", () => {
    const chapterDir = join(tmpDir, ".chapter");

    // Verify getAgent confirms the disabled status
    const entry = getAgent(chapterDir, "note-taker");
    expect(entry).toBeDefined();
    expect(entry!.status).toBe("disabled");

    // The run command checks: if (memberEntry && memberEntry.status === "disabled")
    // This verifies the guard condition would trigger. Full run rejection is
    // covered by unit tests in tests/cli/run.test.ts since run requires Docker.
  }, TIMEOUT);

  it("step 10: chapter enable re-enables the member", () => {
    // Suppress console output during enable
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    runEnable(tmpDir, "@note-taker");

    logSpy.mockRestore();

    // Verify the registry was updated
    const chapterDir = join(tmpDir, ".chapter");
    const registry = readAgentsRegistry(chapterDir);
    const entry = registry.agents["note-taker"];

    expect(entry).toBeDefined();
    expect(entry!.status).toBe("enabled");
  }, TIMEOUT);

  it("step 11: no forge references in generated config files", () => {
    const installDir = join(tmpDir, ".chapter", "agents", "note-taker");

    // Check key generated files for "forge" references (case-insensitive)
    const filesToCheck: Array<[string, string]> = [
      ["docker-compose.yml", join(installDir, "docker-compose.yml")],
      [".env", join(installDir, ".env")],
      ["chapter.lock.json", join(installDir, "chapter.lock.json")],
      ["agents.json", join(tmpDir, ".chapter", "agents.json")],
    ];

    for (const [label, filePath] of filesToCheck) {
      expect(existsSync(filePath)).toBe(true);
      const content = readFileSync(filePath, "utf-8");
      // Find any "forge" references with context for debugging
      const lines = content.split("\n");
      const forgeLines = lines
        .map((line, i) => ({ line, num: i + 1 }))
        .filter(({ line }) => /forge/i.test(line));
      expect(forgeLines, `Found "forge" in ${label}: ${JSON.stringify(forgeLines)}`).toHaveLength(0);
    }
  }, TIMEOUT);
});
