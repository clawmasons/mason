/**
 * E2E Test: Role-Based Workflow
 *
 * Exercises the role-centric pipeline end-to-end:
 *   1. Copy fixture workspace with local ROLE.md to temp dir
 *   2. Verify `chapter list --json` discovers the local role
 *   3. Verify `chapter validate` passes for the local role
 *   4. Verify `chapter build` generates Docker artifacts for the role
 *
 * Uses the local ROLE.md at .mason/roles/test-writer/ROLE.md
 * plus the existing packaged roles from the fixture.
 *
 * PRD refs: UC-1 (Local Role Development), §9.2 (CLI Commands)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  copyFixtureWorkspace,
  masonExec,
  masonExecJson,
  masonExecExpectError,
} from "./helpers.js";

describe("role-based workflow", () => {
  let workspaceDir: string;

  beforeAll(() => {
    // Create temp workspace from fixtures (includes .mason/roles/test-writer/ROLE.md)
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
      const roles = masonExecJson<unknown[]>(
        ["chapter", "list", "--json"],
        workspaceDir,
      );

      // Should find the local role from .mason/roles/test-writer/ROLE.md
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
      const roles = masonExecJson<Array<Record<string, unknown>>>(
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
      masonExec(["chapter", "validate", "test-writer"], workspaceDir);
    });

    it("validates packaged role not found when not installed in node_modules", () => {
      // Packaged roles are only discoverable from node_modules, not workspace packages
      const result = masonExecExpectError(
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
      masonExec(["chapter", "build", "test-writer"], workspaceDir, {
        timeout: 120_000,
      });
      dockerDir = path.join(workspaceDir, ".mason", "docker");
    }, 120_000);

    it("generates docker directory", () => {
      expect(fs.existsSync(dockerDir)).toBe(true);
    });

    it("generates role-specific docker build directory", () => {
      expect(fs.existsSync(path.join(dockerDir, "test-writer"))).toBe(true);
    });

    it("generates proxy Dockerfile", () => {
      expect(
        fs.existsSync(path.join(dockerDir, "test-writer", "mcp-proxy", "Dockerfile")),
      ).toBe(true);
    });

    it("generates agent Dockerfile", () => {
      expect(
        fs.existsSync(path.join(dockerDir, "test-writer", "claude-code-agent", "Dockerfile")),
      ).toBe(true);
    });
  });
});
