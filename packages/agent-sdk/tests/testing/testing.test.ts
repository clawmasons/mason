/**
 * Unit tests for the shared e2e testing library.
 *
 * These tests verify that the testing utilities exported from
 * `@clawmasons/agent-sdk/testing` resolve paths correctly,
 * copy fixtures, and execute the mason CLI binary.
 */

import { describe, it, expect, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  PROJECT_ROOT,
  MASON_BIN,
  FIXTURES_DIR,
  copyFixtureWorkspace,
  masonExec,
  masonExecExpectError,
  isDockerAvailable,
  cleanupDockerSessions,
} from "../../src/testing/index.js";

// Track workspaces for cleanup
const workspacesToClean: string[] = [];

afterAll(() => {
  for (const dir of workspacesToClean) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

// ── Path Constants ──────────────────────────────────────────────────────

describe("path constants", () => {
  it("PROJECT_ROOT points to the monorepo root", () => {
    // The monorepo root has a package.json with workspaces
    const rootPkg = JSON.parse(
      fs.readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf-8"),
    );
    expect(rootPkg.workspaces).toBeDefined();
    expect(Array.isArray(rootPkg.workspaces)).toBe(true);
  });

  it("MASON_BIN points to an existing file", () => {
    expect(fs.existsSync(MASON_BIN)).toBe(true);
  });

  it("FIXTURES_DIR points to an existing directory with claude-test-project", () => {
    expect(fs.existsSync(FIXTURES_DIR)).toBe(true);
    expect(fs.existsSync(path.join(FIXTURES_DIR, "claude-test-project"))).toBe(
      true,
    );
  });
});

// ── copyFixtureWorkspace ────────────────────────────────────────────────

describe("copyFixtureWorkspace", () => {
  it("creates workspace from default fixture", () => {
    const ws = copyFixtureWorkspace("test-default");
    workspacesToClean.push(ws);

    expect(fs.existsSync(ws)).toBe(true);
    expect(ws).toContain("mason-e2e-test-default");

    // Should have package.json
    expect(fs.existsSync(path.join(ws, "package.json"))).toBe(true);

    // Should have .claude and .mason from the fixture
    expect(fs.existsSync(path.join(ws, ".claude"))).toBe(true);
    expect(fs.existsSync(path.join(ws, ".mason"))).toBe(true);

    // Should have the fixture content
    expect(
      fs.existsSync(path.join(ws, ".claude", "commands", "take-notes.md")),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(
          ws,
          ".claude",
          "skills",
          "markdown-conventions",
          "SKILL.md",
        ),
      ),
    ).toBe(true);
  });

  it("creates workspace from named fixture", () => {
    const ws = copyFixtureWorkspace("test-named", {
      fixture: "claude-test-project",
    });
    workspacesToClean.push(ws);

    expect(fs.existsSync(ws)).toBe(true);
    expect(
      fs.existsSync(path.join(ws, ".mason", "roles", "writer", "ROLE.md")),
    ).toBe(true);
  });

  it("respects excludePaths", () => {
    const ws = copyFixtureWorkspace("test-exclude", {
      excludePaths: [".claude/commands"],
    });
    workspacesToClean.push(ws);

    // .claude should exist but commands subdirectory should be removed
    expect(fs.existsSync(path.join(ws, ".claude"))).toBe(true);
    expect(fs.existsSync(path.join(ws, ".claude", "commands"))).toBe(false);
  });

  it("respects extraDirs", () => {
    // First, create a fixture with an extra directory to test with
    // We'll just verify that extraDirs doesn't break anything with
    // a directory that doesn't exist in the fixture (should create empty dir)
    const ws = copyFixtureWorkspace("test-extra", {
      extraDirs: [".codex"],
    });
    workspacesToClean.push(ws);

    // The extra dir should be created (even if empty) since the fixture
    // doesn't have it, it creates an empty directory
    expect(fs.existsSync(path.join(ws, ".codex"))).toBe(true);
  });

  it("throws on missing fixture", () => {
    expect(() => {
      copyFixtureWorkspace("test-missing", {
        fixture: "nonexistent-fixture",
      });
    }).toThrow("not found");
  });
});

// ── isDockerAvailable ───────────────────────────────────────────────────

describe("isDockerAvailable", () => {
  it("returns a boolean without throwing", () => {
    const result = isDockerAvailable();
    expect(typeof result).toBe("boolean");
  });
});

// ── masonExec ───────────────────────────────────────────────────────────

describe("masonExec", () => {
  it("invokes mason binary and returns output", () => {
    // Running --version should succeed and return a version string
    const output = masonExec(["--version"], PROJECT_ROOT);
    expect(output.trim()).toMatch(/\d+\.\d+/);
  });
});

// ── masonExecExpectError ────────────────────────────────────────────────

describe("masonExecExpectError", () => {
  it("captures non-zero exit code from invalid command", () => {
    const result = masonExecExpectError(
      ["totally-invalid-command-xyz"],
      PROJECT_ROOT,
    );
    expect(result.exitCode).not.toBe(0);
  });
});

// ── cleanupDockerSessions ───────────────────────────────────────────────

describe("cleanupDockerSessions", () => {
  it("handles missing sessions directory without throwing", () => {
    const ws = copyFixtureWorkspace("test-cleanup");
    workspacesToClean.push(ws);

    // Should not throw even though .mason/sessions/ doesn't exist
    expect(() => cleanupDockerSessions(ws)).not.toThrow();
  });
});
