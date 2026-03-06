/**
 * End-to-End Integration Test — Install Flow (Local tgz)
 *
 * Validates the complete forge packaging pipeline using only local .tgz files:
 *   npm pack -> npm install tgz -> forge init -> forge validate -> forge list -> forge install
 *
 * This test proves that the entire user journey works without any npm registry access.
 * It exercises all forge-packaging PRD changes:
 *   - forge-core package (Change 1)
 *   - Discovery enhancement (Change 2)
 *   - Template system (Change 3)
 *   - Simplified Dockerfile (Change 4)
 *   - Example removal (Change 5)
 *
 * PRD refs: forge-packaging PRD Section 2 (Measurable Outcomes)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ── Constants ──────────────────────────────────────────────────────────

const FORGE_ROOT = join(import.meta.dirname, "..", "..");
const FORGE_CORE_DIR = join(FORGE_ROOT, "forge-core");
const TIMEOUT = 120_000;

// ── Shared State ───────────────────────────────────────────────────────

let tmpDir: string;
let forgeTgzPath: string;
let forgeCoreTgzPath: string;
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
 * Run the locally-installed forge CLI via node_modules/.bin/forge.
 * Avoids npx, which can resolve to the wrong "forge" package on the registry.
 */
function forgeCli(args: string[], cwd: string): string {
  const forgeBin = join(cwd, "node_modules", ".bin", "forge");
  return run(forgeBin, args, cwd);
}

// ── Setup / Teardown ───────────────────────────────────────────────────

beforeAll(() => {
  // 1. Build forge
  run("npm", ["run", "build"], FORGE_ROOT);

  // 2. Pack @clawforge/forge
  const forgePackJson = run("npm", ["pack", "--json"], FORGE_ROOT);
  const forgePackResult = JSON.parse(forgePackJson) as Array<{ filename: string }>;
  const forgeFilename = forgePackResult[0]!.filename;
  forgeTgzPath = join(FORGE_ROOT, forgeFilename);

  // 3. Pack @clawforge/forge-core
  const corePackJson = run("npm", ["pack", "--json"], FORGE_CORE_DIR);
  const corePackResult = JSON.parse(corePackJson) as Array<{ filename: string }>;
  const coreFilename = corePackResult[0]!.filename;
  forgeCoreTgzPath = join(FORGE_CORE_DIR, coreFilename);

  // 4. Create temp directory
  tmpDir = mkdtempSync(join(tmpdir(), "test-forge-"));
  projectScope = tmpDir.split("/").pop()!;

  // Verify tgz files exist
  expect(existsSync(forgeTgzPath)).toBe(true);
  expect(existsSync(forgeCoreTgzPath)).toBe(true);
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
    if (forgeTgzPath && existsSync(forgeTgzPath)) rmSync(forgeTgzPath);
  } catch {
    /* ignore */
  }
  try {
    if (forgeCoreTgzPath && existsSync(forgeCoreTgzPath)) rmSync(forgeCoreTgzPath);
  } catch {
    /* ignore */
  }
});

// ── Tests ──────────────────────────────────────────────────────────────

describe("E2E Install Flow (Local tgz)", () => {
  // Tests run sequentially within a describe — each step depends on the previous one.

  it("step 1: installs forge from tgz and runs forge init", () => {
    // Initialize a bare package.json so npm install works
    run("npm", ["init", "-y"], tmpDir);

    // Install forge tgz to get the CLI
    run("npm", ["install", forgeTgzPath], tmpDir);

    // Verify forge CLI is available
    expect(existsSync(join(tmpDir, "node_modules", ".bin", "forge"))).toBe(true);

    // Run forge init --template note-taker
    // This will copy template files (including package.json with @clawforge/forge-core dep),
    // create .forge/ scaffold, and attempt npm install. The npm install inside init
    // may warn about @clawforge/forge-core not being on the registry — that's expected
    // for local tgz testing. The template files are still copied correctly.
    forgeCli(["init", "--template", "note-taker"], tmpDir);

    // Verify scaffold was created
    expect(existsSync(join(tmpDir, ".forge"))).toBe(true);
    expect(existsSync(join(tmpDir, ".forge", "config.json"))).toBe(true);

    // Verify template files were copied
    expect(existsSync(join(tmpDir, "agents", "note-taker", "package.json"))).toBe(true);
    expect(existsSync(join(tmpDir, "roles", "writer", "package.json"))).toBe(true);

    // Verify agent package.json has correct project scope
    const agentPkg = JSON.parse(
      readFileSync(join(tmpDir, "agents", "note-taker", "package.json"), "utf-8"),
    ) as { name: string };
    expect(agentPkg.name).toBe(`@${projectScope}/agent-note-taker`);

    // Verify role package.json has correct project scope
    const rolePkg = JSON.parse(
      readFileSync(join(tmpDir, "roles", "writer", "package.json"), "utf-8"),
    ) as { name: string };
    expect(rolePkg.name).toBe(`@${projectScope}/role-writer`);
  }, TIMEOUT);

  it("step 2: installs both tgz packages for full dependency resolution", () => {
    // After forge init, the template's package.json replaced the original.
    // Install both forge and forge-core tgz files to populate node_modules
    // with all required packages for discovery and CLI usage.
    run("npm", ["install", forgeTgzPath, forgeCoreTgzPath], tmpDir);

    // Verify both packages are installed
    expect(existsSync(join(tmpDir, "node_modules", "@clawforge", "forge"))).toBe(true);
    expect(existsSync(join(tmpDir, "node_modules", "@clawforge", "forge-core"))).toBe(true);

    // Verify forge CLI binary is linked
    expect(existsSync(join(tmpDir, "node_modules", ".bin", "forge"))).toBe(true);

    // Verify forge-core contains expected component structure
    expect(
      existsSync(join(tmpDir, "node_modules", "@clawforge", "forge-core", "apps", "filesystem", "package.json")),
    ).toBe(true);
    expect(
      existsSync(join(tmpDir, "node_modules", "@clawforge", "forge-core", "tasks", "take-notes", "package.json")),
    ).toBe(true);
    expect(
      existsSync(join(tmpDir, "node_modules", "@clawforge", "forge-core", "skills", "markdown-conventions", "package.json")),
    ).toBe(true);
  }, TIMEOUT);

  it("step 3: forge validate confirms agent graph is valid", () => {
    const agentName = `@${projectScope}/agent-note-taker`;
    const output = forgeCli(["validate", agentName], tmpDir);
    expect(output).toContain("is valid");
  }, TIMEOUT);

  it("step 4: forge list shows complete agent dependency tree", () => {
    const output = forgeCli(["list", "--json"], tmpDir);
    const agents = JSON.parse(output) as Array<{
      name: string;
      roles: Array<{
        name: string;
        tasks: Array<{ name: string }>;
        skills: Array<{ name: string }>;
        apps: Array<{ name: string }>;
      }>;
    }>;

    // Should have at least one agent (may also pick up forge-core's agent)
    expect(agents.length).toBeGreaterThanOrEqual(1);

    // Find our template agent (local scope takes precedence)
    const agent = agents.find((a) => a.name === `@${projectScope}/agent-note-taker`);
    expect(agent).toBeDefined();

    // Agent should have the writer role
    const role = agent!.roles.find((r) => r.name === `@${projectScope}/role-writer`);
    expect(role).toBeDefined();

    // Role should reference forge-core components
    expect(role!.tasks.some((t) => t.name === "@clawforge/task-take-notes")).toBe(true);
    expect(role!.skills.some((s) => s.name === "@clawforge/skill-markdown-conventions")).toBe(true);
    expect(role!.apps.some((a) => a.name === "@clawforge/app-filesystem")).toBe(true);
  }, TIMEOUT);

  it("step 5: forge install generates single-stage Dockerfile", () => {
    const agentName = `@${projectScope}/agent-note-taker`;
    forgeCli(["install", agentName], tmpDir);

    // Verify output directory was created
    const installDir = join(tmpDir, ".forge", "agents", "note-taker");
    expect(existsSync(installDir)).toBe(true);

    // Verify Dockerfile exists and is single-stage
    const dockerfilePath = join(installDir, "forge-proxy", "Dockerfile");
    expect(existsSync(dockerfilePath)).toBe(true);

    const dockerfile = readFileSync(dockerfilePath, "utf-8");
    expect(dockerfile).not.toContain("AS builder");
    expect(dockerfile).toContain("FROM node:22-slim");
    expect(dockerfile).toContain(`CMD ["proxy", "--agent", "${agentName}"]`);

    // Verify docker-compose.yml exists
    expect(existsSync(join(installDir, "docker-compose.yml"))).toBe(true);

    // Verify forge proxy build context has pre-built artifacts (not source)
    expect(existsSync(join(installDir, "forge-proxy", "forge", "dist"))).toBe(true);
    expect(existsSync(join(installDir, "forge-proxy", "forge", "bin"))).toBe(true);
    expect(existsSync(join(installDir, "forge-proxy", "forge", "package.json"))).toBe(true);
  }, TIMEOUT);
});
