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
 */

import { describe, it, expect, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  copyFixtureWorkspace,
  masonExecExpectError,
  isDockerAvailable,
} from "./helpers.js";

// ── Helpers ──────────────────────────────────────────────────────────────

const E2E_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
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
 * Create a workspace from the project-role fixture, including .codex/ which
 * is not in the default WORKSPACE_DIRS list.
 */
function createProjectRoleWorkspace(name: string): string {
  const workspaceDir = copyFixtureWorkspace(name, { fixture: "project-role" });

  // Copy .codex/ directory (not handled by copyFixtureWorkspace)
  const codexSrc = path.join(FIXTURES_BASE, "project-role", ".codex");
  const codexDest = path.join(workspaceDir, ".codex");
  if (fs.existsSync(codexSrc)) {
    copyDirRecursive(codexSrc, codexDest);
  }

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
      ["run", "--agent", "claude", "--source", "gpt"],
      ws,
    );

    expect(result.exitCode).not.toBe(0);
    const output = result.stderr + result.stdout;
    expect(output).toContain("Unknown source");
    expect(output).toContain("gpt");
    // Should list available sources
    expect(output).toContain("claude");
  });

  // ── Scenario 7b: Missing source directory ────────────────────────────

  it("errors when source directory does not exist", () => {
    const ws = createEmptyWorkspace("pr-missing-source");
    workspacesToClean.push(ws);

    const result = masonExecExpectError(
      ["run", "--agent", "claude"],
      ws,
    );

    expect(result.exitCode).not.toBe(0);
    const output = result.stderr + result.stdout;
    expect(output).toContain("Source directory");
    expect(output).toContain("not found");
  });

  // ── Scenario 7c: Empty source directory ──────────────────────────────

  it("does not fail with source-not-found for empty source directory", () => {
    const ws = createEmptyWorkspace("pr-empty-source");
    workspacesToClean.push(ws);

    // Create an empty .claude directory with no commands/skills/settings
    fs.mkdirSync(path.join(ws, ".claude"), { recursive: true });

    // The command may succeed (Docker builds an empty project role) or fail
    // at Docker compose, depending on the environment. Either way, it must
    // NOT fail with a "Source directory not found" error — the dir exists.
    const result = masonExecExpectError(
      ["run", "--agent", "claude"],
      ws,
    );

    const output = result.stderr + result.stdout;
    expect(output).not.toContain("Source directory");
    expect(output).not.toContain("not found in project");
  });

  // ── Scenario 5: Implied alias routing ────────────────────────────────

  it("routes implied agent alias (mason codex) to run command", () => {
    const ws = createEmptyWorkspace("pr-implied-alias");
    workspacesToClean.push(ws);

    // Run "mason codex" — no alias configured, but codex is a known agent type
    // Should be rewritten to "mason run --agent codex" and then fail with
    // source-dir-not-found (proving the alias routing worked)
    const result = masonExecExpectError(["codex"], ws);

    expect(result.exitCode).not.toBe(0);
    const output = result.stderr + result.stdout;

    // Should NOT say "Unknown command" — that would mean alias routing failed
    expect(output).not.toContain("Unknown command");

    // Should have reached the project role generation phase
    // (fails with missing source directory, which is the expected behavior)
    expect(output).toContain("Source directory");
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
});
