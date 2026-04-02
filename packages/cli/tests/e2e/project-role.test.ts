/**
 * E2E Test: Project Role — CLI integration tests
 *
 * Validates the project role feature end-to-end by invoking the `mason` CLI
 * binary and asserting on stdout/stderr outputs and exit codes.
 *
 * Tests cover:
 *   1. Zero-config session (project with .claude/ config)
 *   2. Cross-source (--source claude with codex agent)
 *   3. Multi-source merge (--source claude --source codex)
 *   4. Docker pre-flight failure
 *   5. Implied agent alias routing
 *   6. Source override with explicit role
 *   7. Error cases (invalid source, missing source dir, empty source dir)
 *   8. Default project role auto-creation (PRD §4)
 *   9. Default project role reuse (PRD §4.1)
 *  10. Wildcard all tasks (PRD §7)
 *  11. Scoped wildcard tasks (PRD §7)
 *  12. Explicit task restriction (PRD §6)
 *  13. tasks/commands alias (PRD §5)
 *  14. Role includes (PRD §8)
 *  15. Circular include detection (PRD §8.5)
 *  16. Write failure fallback (PRD §4.2, UC-7)
 */

import { describe, it, expect, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  masonExecExpectError,
  isDockerAvailable,
} from "@clawmasons/agent-sdk/testing";

// ── Helpers ──────────────────────────────────────────────────────────────

const E2E_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const FIXTURES_BASE = path.join(E2E_ROOT, "fixtures");

/**
 * Recursively copy a directory tree, skipping node_modules and .git.
 */
function copyDirRecursive(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Create a workspace from the local project-role fixture.
 * Copies the entire fixture tree (including .codex/) to a timestamped tmp dir.
 */
function createProjectRoleWorkspace(name: string): string {
  const fixtureDir = path.join(FIXTURES_BASE, "project-role");
  const timestamp = Date.now();
  const workspaceDir = path.join(E2E_ROOT, "tmp", `${name}-${timestamp}`);
  fs.mkdirSync(workspaceDir, { recursive: true });

  copyDirRecursive(fixtureDir, workspaceDir);

  return workspaceDir;
}

/**
 * Create a minimal empty workspace (no agent directories).
 */
function createEmptyWorkspace(name: string): string {
  const timestamp = Date.now();
  const workspaceDir = path.join(E2E_ROOT, "tmp", `${name}-${timestamp}`);
  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.writeFileSync(
    path.join(workspaceDir, "package.json"),
    JSON.stringify({ name: "empty-test", version: "1.0.0", private: true }),
  );
  return workspaceDir;
}

// Track workspaces for cleanup
const workspacesToClean: string[] = [];

afterAll(() => {
  for (const dir of workspacesToClean) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

// ── Test Suite ──────────────────────────────────────────────────────────

describe("project-role: CLI e2e", () => {
  // ── Scenario 7a: Invalid --source value ──────────────────────────────

  it("rejects invalid --source value with helpful error", () => {
    const ws = createProjectRoleWorkspace("pr-invalid-source");
    workspacesToClean.push(ws);

    const result = masonExecExpectError(
      ["run", "--agent", "mcp", "--source", "gpt"],
      ws,
    );

    expect(result.exitCode).not.toBe(0);
    const output = result.stderr + result.stdout;
    expect(output).toContain("Unknown source");
    expect(output).toContain("gpt");
  });

  // ── Scenario 7b: Missing source directory ────────────────────────────

  it("does not crash when source directory does not exist (auto-creates role)", () => {
    const ws = createEmptyWorkspace("pr-missing-source");
    workspacesToClean.push(ws);

    // With auto-creation, the CLI creates .mason/roles/project/ROLE.md and
    // proceeds to Docker build. It no longer fails with "Source directory not found"
    // because the auto-created role uses wildcard patterns that resolve to empty.
    const result = masonExecExpectError(
      ["run", "--agent", "mcp"],
      ws,
    );

    const output = result.stderr + result.stdout;
    // Should NOT fail with "Unknown source" — mcp is valid
    expect(output).not.toContain("Unknown source");
  });

  // ── Scenario 7c: Empty source directory ──────────────────────────────

  it("does not fail with source-not-found for empty source directory", () => {
    const ws = createEmptyWorkspace("pr-empty-source");
    workspacesToClean.push(ws);

    // Create an empty source directory for the agent under test.
    // mcp-agent looks for .mcp/, claude looks for .claude/, etc.
    fs.mkdirSync(path.join(ws, ".mcp"), { recursive: true });

    // The command may succeed (Docker builds an empty project role) or fail
    // at Docker compose, depending on the environment. Either way, it must
    // NOT fail with a "Source directory not found" error — the dir exists.
    const result = masonExecExpectError(
      ["run", "--agent", "mcp"],
      ws,
    );

    const output = result.stderr + result.stdout;
    expect(output).not.toContain("Source directory");
    expect(output).not.toContain("not found in project");
  });

  // ── Scenario 5: Implied alias routing ────────────────────────────────

  it("routes implied agent alias (mason pi) to run command", () => {
    const ws = createEmptyWorkspace("pr-implied-alias");
    workspacesToClean.push(ws);

    // Run "mason pi" — pi is a known agent alias (for pi-coding-agent)
    // Should be rewritten to "mason run --agent pi" and then fail with
    // source-dir-not-found (proving the alias routing worked)
    const result = masonExecExpectError(["pi"], ws);

    expect(result.exitCode).not.toBe(0);
    const output = result.stderr + result.stdout;

    // Should NOT say "Unknown command" — that would mean alias routing failed
    expect(output).not.toContain("Unknown command");

    // Should have reached the agent resolution phase (proving the alias routing worked).
    // The agent may not be installed (moved to mason-extensions), so we check for
    // either the agent name or an "Unknown agent" message (which still proves routing worked).
    expect(output.includes("pi-coding-agent") || output.includes("Unknown agent")).toBe(true);
  });

  // ── Scenario 6: Source override with explicit role ────────────────────

  it("accepts --role with --source override without source validation error", () => {
    const ws = createProjectRoleWorkspace("pr-source-override-role");
    workspacesToClean.push(ws);

    // Run with explicit role and source override — should NOT fail at source validation
    // Will fail at Docker check instead (which proves --role + --source was accepted)
    const result = masonExecExpectError(
      ["run", "--agent", "claude", "--role", "writer", "--source", "codex"],
      ws,
    );

    const output = result.stderr + result.stdout;

    // Should NOT fail with "Unknown source" — codex is valid
    expect(output).not.toContain("Unknown source");

    // Should NOT fail with "Source directory not found" — with --role,
    // we skip project role generation entirely
    expect(output).not.toContain("Source directory");
    expect(output).not.toContain("not found in project");
  });

  // ── Scenario 4: Docker pre-flight check ──────────────────────────────

  it("fails with Docker error when Docker is unavailable", () => {
    if (isDockerAvailable()) {
      // Can't test Docker-unavailable path when Docker is present and healthy.
      // This test verifies error handling only when Docker is absent.
      return;
    }

    const ws = createProjectRoleWorkspace("pr-docker-check");
    workspacesToClean.push(ws);

    const result = masonExecExpectError(
      ["run", "--agent", "claude"],
      ws,
      { timeout: 60_000 },
    );

    expect(result.exitCode).not.toBe(0);
    const output = result.stderr + result.stdout;
    // Error may come from the Docker pre-flight check ("Docker Compose v2")
    // or from the Docker build step (when `docker compose version` succeeds
    // but the daemon is not running). Either way, the error is Docker-related.
    const hasDockerError =
      output.includes("Docker Compose v2") ||
      output.includes("Docker") ||
      output.includes("docker");
    expect(hasDockerError).toBe(true);
  });

  // ── Scenarios 1, 2, 3: Docker-dependent ──────────────────────────────

  describe("with Docker", () => {
    // These tests require Docker to proceed past the pre-flight check.
    // They verify that the CLI accepts the arguments and begins the
    // agent startup flow — they do not wait for full agent sessions.

    it("generates project role from .claude/ directory (zero-config)", () => {
      if (!isDockerAvailable()) return;

      const ws = createProjectRoleWorkspace("pr-zero-config");
      workspacesToClean.push(ws);

      // mason run --agent claude — should reach Docker build/run phase
      // Use a short timeout since we just need to verify it starts
      const result = masonExecExpectError(
        ["run", "--agent", "claude"],
        ws,
        { timeout: 30_000 },
      );

      const output = result.stderr + result.stdout;

      // Should NOT fail at source validation
      expect(output).not.toContain("Source directory");
      expect(output).not.toContain("Unknown source");
      // Should indicate it's starting the agent session
      // (may still fail during Docker build, but that's past project role generation)
    });

    it("accepts cross-source (--source claude for codex agent)", () => {
      if (!isDockerAvailable()) return;

      const ws = createProjectRoleWorkspace("pr-cross-source");
      workspacesToClean.push(ws);

      const result = masonExecExpectError(
        ["run", "--agent", "codex", "--source", "claude"],
        ws,
        { timeout: 30_000 },
      );

      const output = result.stderr + result.stdout;

      // Should NOT fail at source validation — .claude/ exists
      expect(output).not.toContain("Source directory");
      expect(output).not.toContain("Unknown source");
    });

    it("accepts multi-source merge (--source claude --source codex)", () => {
      if (!isDockerAvailable()) return;

      const ws = createProjectRoleWorkspace("pr-multi-source");
      workspacesToClean.push(ws);

      const result = masonExecExpectError(
        ["run", "--agent", "claude", "--source", "claude", "--source", "codex"],
        ws,
        { timeout: 30_000 },
      );

      const output = result.stderr + result.stdout;

      // Should NOT fail at source validation — both dirs exist
      expect(output).not.toContain("Source directory");
      expect(output).not.toContain("Unknown source");
    });
  });

  // ── Default Project Role: Auto-creation and Lifecycle ───────────────

  describe("default-project-role", () => {
    // These tests validate the default-project-role PRD (changes 1-4).
    // Auto-creation and role loading happen BEFORE Docker checks, so
    // file artifacts can be verified regardless of Docker availability.

    it("auto-creates .mason/roles/project/ROLE.md on first run without --role", () => {
      if (!isDockerAvailable()) return;

      const ws = createProjectRoleWorkspace("dpr-auto-create");
      workspacesToClean.push(ws);

      const rolePath = path.join(ws, ".mason", "roles", "project", "ROLE.md");
      expect(fs.existsSync(rolePath)).toBe(false);

      // Run mason claude without --role — should auto-create the default project role
      masonExecExpectError(
        ["run", "--agent", "claude"],
        ws,
        { timeout: 30_000 },
      );

      // Verify the ROLE.md was created on disk
      expect(fs.existsSync(rolePath)).toBe(true);

      const content = fs.readFileSync(rolePath, "utf-8");
      // Template must contain the correct source (claude), wildcard tasks, and wildcard skills
      expect(content).toContain("sources:");
      expect(content).toContain("- claude");
      expect(content).toContain('tasks:');
      expect(content).toContain('- "*"');
      expect(content).toContain('skills:');
      expect(content).toContain("name: project");
      expect(content).toContain("type: project");
    });

    it("reuses existing .mason/roles/project/ROLE.md without overwriting", () => {
      if (!isDockerAvailable()) return;

      const ws = createProjectRoleWorkspace("dpr-reuse");
      workspacesToClean.push(ws);

      // Pre-create a custom ROLE.md with specific content
      const roleDir = path.join(ws, ".mason", "roles", "project");
      fs.mkdirSync(roleDir, { recursive: true });
      const rolePath = path.join(roleDir, "ROLE.md");
      const customContent = `---
name: project
type: project
description: Custom project role

sources:
  - claude

tasks:
  - review

skills: []
risk: LOW
---

Custom instructions that should not be overwritten.
`;
      fs.writeFileSync(rolePath, customContent, "utf-8");

      // Run mason claude — should load existing file, not overwrite
      masonExecExpectError(
        ["run", "--agent", "claude"],
        ws,
        { timeout: 30_000 },
      );

      // Verify the file was NOT overwritten
      const afterContent = fs.readFileSync(rolePath, "utf-8");
      expect(afterContent).toBe(customContent);
    });

    it("auto-created ROLE.md uses wildcard tasks: [\"*\"] for include-all", () => {
      if (!isDockerAvailable()) return;

      const ws = createProjectRoleWorkspace("dpr-wildcard-all");
      workspacesToClean.push(ws);

      masonExecExpectError(
        ["run", "--agent", "claude"],
        ws,
        { timeout: 30_000 },
      );

      const rolePath = path.join(ws, ".mason", "roles", "project", "ROLE.md");
      expect(fs.existsSync(rolePath)).toBe(true);

      const content = fs.readFileSync(rolePath, "utf-8");
      // The auto-created file should have wildcard tasks and skills
      // (the actual wildcard expansion happens at resolution time, not in the file)
      expect(content).toContain('- "*"');
    });

    it("accepts scoped wildcard tasks: [\"deploy/*\"] without error", () => {
      if (!isDockerAvailable()) return;

      const ws = createProjectRoleWorkspace("dpr-scoped-wildcard");
      workspacesToClean.push(ws);

      // Pre-create a ROLE.md with scoped wildcard for deploy tasks
      const roleDir = path.join(ws, ".mason", "roles", "project");
      fs.mkdirSync(roleDir, { recursive: true });
      fs.writeFileSync(
        path.join(roleDir, "ROLE.md"),
        `---
name: project
type: project
sources:
  - claude
tasks:
  - "deploy/*"
skills:
  - "*"
risk: LOW
---

Scoped wildcard test role.
`,
        "utf-8",
      );

      // Run mason — the scoped wildcard should expand against .claude/commands/deploy/
      // which has staging.md and production.md in the fixture
      const result = masonExecExpectError(
        ["run", "--agent", "claude"],
        ws,
        { timeout: 30_000 },
      );

      const output = result.stderr + result.stdout;
      // Should NOT fail at role parsing or wildcard validation
      expect(output).not.toContain("Unsupported glob syntax");
      expect(output).not.toContain("Unknown source");
    });

    it("accepts explicit task restriction tasks: [\"review\"] without error", () => {
      if (!isDockerAvailable()) return;

      const ws = createProjectRoleWorkspace("dpr-explicit-tasks");
      workspacesToClean.push(ws);

      // Pre-create a ROLE.md with explicit task list
      const roleDir = path.join(ws, ".mason", "roles", "project");
      fs.mkdirSync(roleDir, { recursive: true });
      fs.writeFileSync(
        path.join(roleDir, "ROLE.md"),
        `---
name: project
type: project
sources:
  - claude
tasks:
  - review
skills: []
risk: LOW
---

Explicit tasks only.
`,
        "utf-8",
      );

      const result = masonExecExpectError(
        ["run", "--agent", "claude"],
        ws,
        { timeout: 30_000 },
      );

      const output = result.stderr + result.stdout;
      // Should NOT fail at role parsing
      expect(output).not.toContain("Unknown source");
      expect(output).not.toContain("Unsupported glob syntax");
    });

    it("accepts commands: [\"*\"] as alias for tasks in mason dialect ROLE.md", () => {
      if (!isDockerAvailable()) return;

      const ws = createProjectRoleWorkspace("dpr-alias-commands");
      workspacesToClean.push(ws);

      // Pre-create a ROLE.md using "commands" instead of "tasks" (mason dialect alias)
      const roleDir = path.join(ws, ".mason", "roles", "project");
      fs.mkdirSync(roleDir, { recursive: true });
      fs.writeFileSync(
        path.join(roleDir, "ROLE.md"),
        `---
name: project
type: project
sources:
  - claude
commands:
  - "*"
skills:
  - "*"
risk: LOW
---

Using commands alias for tasks field.
`,
        "utf-8",
      );

      const result = masonExecExpectError(
        ["run", "--agent", "claude"],
        ws,
        { timeout: 30_000 },
      );

      const output = result.stderr + result.stdout;
      // Should NOT fail at role parsing — "commands" is recognized as alias for "tasks"
      expect(output).not.toContain("Unknown source");
      // The CLI should proceed past role loading (may fail at Docker, which is fine)
    });

    it("merges role.includes from a local role", () => {
      if (!isDockerAvailable()) return;

      const ws = createProjectRoleWorkspace("dpr-role-includes");
      workspacesToClean.push(ws);

      // The fixture already has .mason/roles/base-role/ROLE.md
      // Create project ROLE.md that includes base-role
      const roleDir = path.join(ws, ".mason", "roles", "project");
      fs.mkdirSync(roleDir, { recursive: true });
      fs.writeFileSync(
        path.join(roleDir, "ROLE.md"),
        `---
name: project
type: project
sources:
  - claude
tasks:
  - "*"
skills:
  - "*"
role:
  includes:
    - base-role
risk: LOW
---

Project role that includes base-role.
`,
        "utf-8",
      );

      const result = masonExecExpectError(
        ["run", "--agent", "claude"],
        ws,
        { timeout: 30_000 },
      );

      const output = result.stderr + result.stdout;
      // Should NOT fail at role inclusion resolution
      expect(output).not.toContain("not found");
      expect(output).not.toContain("Circular role inclusion");
    });

    it("detects circular role includes and reports cycle chain", () => {
      if (!isDockerAvailable()) return;

      const ws = createProjectRoleWorkspace("dpr-circular-include");
      workspacesToClean.push(ws);

      // Create project ROLE.md that includes "looper"
      const projectRoleDir = path.join(ws, ".mason", "roles", "project");
      fs.mkdirSync(projectRoleDir, { recursive: true });
      fs.writeFileSync(
        path.join(projectRoleDir, "ROLE.md"),
        `---
name: project
type: project
description: Circular include test project role
sources:
  - claude
tasks:
  - "*"
skills: []
role:
  includes:
    - looper
risk: LOW
---

Circular include test — project includes looper.
`,
        "utf-8",
      );

      // Create looper ROLE.md that includes "project" (creating the cycle)
      const looperRoleDir = path.join(ws, ".mason", "roles", "looper");
      fs.mkdirSync(looperRoleDir, { recursive: true });
      fs.writeFileSync(
        path.join(looperRoleDir, "ROLE.md"),
        `---
name: looper
type: project
description: Circular include test looper role
sources:
  - claude
tasks: []
skills: []
role:
  includes:
    - project
risk: LOW
---

Circular include test — looper includes project.
`,
        "utf-8",
      );

      const result = masonExecExpectError(
        ["run", "--agent", "claude"],
        ws,
        { timeout: 30_000 },
      );

      expect(result.exitCode).not.toBe(0);
      const output = result.stderr + result.stdout;
      // Should detect the circular inclusion and report the cycle chain
      expect(output).toContain("Circular role inclusion");
    });

    it("auto-creates project role when --role project is specified on fresh directory", () => {
      if (!isDockerAvailable()) return;

      const ws = createProjectRoleWorkspace("dpr-explicit-role-fresh");
      workspacesToClean.push(ws);

      // Remove any pre-existing .mason/roles/project/ to simulate fresh dir
      const projectRoleDir = path.join(ws, ".mason", "roles", "project");
      if (fs.existsSync(projectRoleDir)) {
        fs.rmSync(projectRoleDir, { recursive: true, force: true });
      }

      const rolePath = path.join(projectRoleDir, "ROLE.md");
      expect(fs.existsSync(rolePath)).toBe(false);

      // Run with explicit --role project — should auto-create the role
      const result = masonExecExpectError(
        ["run", "--agent", "claude", "--role", "project"],
        ws,
        { timeout: 30_000 },
      );

      const output = result.stderr + result.stdout;
      // Should NOT fail with "Role project not found"
      expect(output).not.toContain("Role \"project\" not found");

      // The ROLE.md should have been auto-created
      expect(fs.existsSync(rolePath)).toBe(true);
    });

    it("expands wildcard skills in auto-created project role", () => {
      if (!isDockerAvailable()) return;

      const ws = createProjectRoleWorkspace("dpr-wildcard-skill-expand");
      workspacesToClean.push(ws);

      // Verify the fixture has the testing skill
      const skillPath = path.join(ws, ".claude", "skills", "testing", "SKILL.md");
      expect(fs.existsSync(skillPath)).toBe(true);

      // Run mason without --role — auto-creates and resolves project role with wildcards
      const result = masonExecExpectError(
        ["run", "--agent", "claude"],
        ws,
        { timeout: 30_000 },
      );

      const output = result.stderr + result.stdout;
      // Wildcard expansion should succeed — no "skill * not found" warning
      expect(output).not.toContain('skill "*" not found');
      // Task wildcard should also expand — no "task * not found" warning
      expect(output).not.toContain('task "*" not found');
    });

    it("falls back to in-memory role when directory is read-only (UC-7)", () => {
      if (!isDockerAvailable()) return;
      // Skip on CI or environments where chmod may not work as expected
      if (process.getuid?.() === 0) return;

      const ws = createProjectRoleWorkspace("dpr-write-failure");
      workspacesToClean.push(ws);

      // Make the .mason/roles/ directory read-only so ROLE.md cannot be created
      const rolesDir = path.join(ws, ".mason", "roles");
      // Remove any existing project role directory
      const projectRoleDir = path.join(rolesDir, "project");
      if (fs.existsSync(projectRoleDir)) {
        fs.rmSync(projectRoleDir, { recursive: true, force: true });
      }
      // Make roles directory read-only (prevents creating project/ subdirectory)
      fs.chmodSync(rolesDir, 0o555);

      try {
        const result = masonExecExpectError(
          ["run", "--agent", "claude"],
          ws,
          { timeout: 30_000 },
        );

        const output = result.stderr + result.stdout;
        // Should warn about write failure and fall back to in-memory role
        expect(output).toContain("Could not create default project role");

        // The project ROLE.md should NOT exist on disk
        expect(fs.existsSync(path.join(projectRoleDir, "ROLE.md"))).toBe(false);
      } finally {
        // Restore permissions for cleanup
        fs.chmodSync(rolesDir, 0o755);
      }
    });
  });
});
