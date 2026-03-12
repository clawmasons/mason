/**
 * E2E Test: Role-Based Workflow
 *
 * Exercises the role-centric pipeline end-to-end:
 *   1. Copy fixture workspace with local ROLE.md to temp dir
 *   2. Verify `chapter list --json` discovers the local role
 *   3. Verify `chapter validate` passes for the local role
 *   4. Verify `chapter build` generates Docker artifacts for the role
 *
 * Uses the local ROLE.md at .claude/roles/test-writer/ROLE.md
 * (Claude dialect) plus the existing packaged roles from the fixture.
 *
 * PRD refs: UC-1 (Local Role Development), §9.2 (CLI Commands)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  copyFixtureWorkspace,
  chapterExec,
  chapterExecJson,
  chapterExecExpectError,
} from "./helpers.js";

describe("role-based workflow", () => {
  let workspaceDir: string;

  beforeAll(() => {
    // Create temp workspace from fixtures (includes .claude/roles/test-writer/ROLE.md)
    workspaceDir = copyFixtureWorkspace("role-workflow", {
      excludePaths: ["agents/mcp-test", "roles/mcp-test"],
    });
  }, 30_000);

  afterAll(() => {
    if (workspaceDir && fs.existsSync(workspaceDir)) {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  // -- Role Discovery via chapter list ----------------------------------------

  describe("chapter list", () => {
    it("discovers local ROLE.md roles", () => {
      const roles = chapterExecJson<unknown[]>(
        ["chapter", "list", "--json"],
        workspaceDir,
      );

      // Should find the local role from .claude/roles/test-writer/ROLE.md
      expect(roles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            metadata: expect.objectContaining({ name: "test-writer" }),
            source: expect.objectContaining({ type: "local" }),
          }),
        ]),
      );
    });

    it("returns roles with expected structure", () => {
      const roles = chapterExecJson<Array<Record<string, unknown>>>(
        ["chapter", "list", "--json"],
        workspaceDir,
      );

      expect(roles.length).toBeGreaterThan(0);

      for (const role of roles) {
        expect(role).toHaveProperty("metadata");
        expect(role).toHaveProperty("source");
        expect(role).toHaveProperty("tasks");
        expect(role).toHaveProperty("apps");
        expect(role).toHaveProperty("skills");
      }
    });
  });

  // -- Role Validation via chapter validate -----------------------------------

  describe("chapter validate", () => {
    it("validates local ROLE.md role successfully", () => {
      // Should exit 0 (no throw)
      chapterExec(["chapter", "validate", "test-writer"], workspaceDir);
    });

    it("validates packaged role not found when not installed in node_modules", () => {
      // Packaged roles are only discoverable from node_modules, not workspace packages
      const result = chapterExecExpectError(
        ["chapter", "validate", "@test/role-writer"],
        workspaceDir,
      );
      expect(result.exitCode).not.toBe(0);
      const output = result.stderr + result.stdout;
      expect(output).toContain("not found");
    });
  });

  // -- Role Build via chapter build -------------------------------------------

  describe("chapter build", () => {
    let dockerDir: string;

    beforeAll(() => {
      // Build the workspace using the local role
      chapterExec(["chapter", "build", "test-writer"], workspaceDir, {
        timeout: 120_000,
      });
      dockerDir = path.join(workspaceDir, "docker");
    }, 120_000);

    it("creates chapter.lock.json", () => {
      const lockPath = path.join(workspaceDir, "chapter.lock.json");
      expect(fs.existsSync(lockPath)).toBe(true);
    });

    it("lock file references the local role", () => {
      const lock = JSON.parse(
        fs.readFileSync(
          path.join(workspaceDir, "chapter.lock.json"),
          "utf-8",
        ),
      );
      expect(lock.role.name).toBe("test-writer");
    });

    it("creates dist/ with .tgz files", () => {
      const distDir = path.join(workspaceDir, "dist");
      expect(fs.existsSync(distDir)).toBe(true);
      const tgzFiles = fs
        .readdirSync(distDir)
        .filter((f) => f.endsWith(".tgz"));
      expect(tgzFiles.length).toBeGreaterThan(0);
    });

    it("generates docker directory", () => {
      expect(fs.existsSync(dockerDir)).toBe(true);
    });

    it("has docker/node_modules with framework packages", () => {
      expect(
        fs.existsSync(
          path.join(
            dockerDir,
            "node_modules",
            "@clawmasons",
            "chapter",
            "package.json",
          ),
        ),
      ).toBe(true);
    });
  });
});
