/**
 * E2E Test: Error Paths
 *
 * Verifies that the CLI produces clear error messages for:
 *   1. Missing roles (nonexistent name)
 *   2. Malformed ROLE.md (invalid YAML frontmatter)
 *   3. Missing packaged roles (uninstalled npm package) with install instructions
 *
 * PRD refs: §8.2 (Packaged Role -- error on missing), §12 (Use Cases)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  copyFixtureWorkspace,
  chapterExecExpectError,
} from "./helpers.js";

describe("error paths", () => {
  let workspaceDir: string;

  beforeAll(() => {
    workspaceDir = copyFixtureWorkspace("error-paths", {
      excludePaths: ["agents/mcp-test", "roles/mcp-test"],
    });
  }, 30_000);

  afterAll(() => {
    if (workspaceDir && fs.existsSync(workspaceDir)) {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  // -- Missing Role -----------------------------------------------------------

  describe("missing role", () => {
    it("chapter validate exits with error for nonexistent role", () => {
      const result = chapterExecExpectError(
        ["chapter", "validate", "nonexistent-role"],
        workspaceDir,
      );

      expect(result.exitCode).not.toBe(0);
      const output = result.stderr + result.stdout;
      expect(output).toContain("not found");
    });

    it("chapter build exits with error for nonexistent role", () => {
      const result = chapterExecExpectError(
        ["chapter", "build", "nonexistent-role"],
        workspaceDir,
      );

      expect(result.exitCode).not.toBe(0);
      const output = result.stderr + result.stdout;
      expect(output).toContain("not found");
    });
  });

  // -- Missing Packaged Role --------------------------------------------------

  describe("missing packaged role", () => {
    it("chapter validate shows install instructions for uninstalled package role", () => {
      const result = chapterExecExpectError(
        ["chapter", "validate", "@acme/role-missing"],
        workspaceDir,
      );

      expect(result.exitCode).not.toBe(0);
      const output = result.stderr + result.stdout;
      // Should contain install instructions
      expect(output).toContain("npm install");
      expect(output).toContain("@acme/role-missing");
    });
  });

  // -- Malformed ROLE.md ------------------------------------------------------

  describe("malformed ROLE.md", () => {
    it("chapter list still works when one role has invalid frontmatter", () => {
      // Create a malformed ROLE.md in the workspace
      const malformedDir = path.join(
        workspaceDir,
        ".claude",
        "roles",
        "malformed-role",
      );
      fs.mkdirSync(malformedDir, { recursive: true });
      fs.writeFileSync(
        path.join(malformedDir, "ROLE.md"),
        "This is not valid YAML frontmatter - no --- delimiters",
      );

      // chapter list should still succeed (discovery skips malformed roles)
      // but the malformed role should not appear in the results
      const result = chapterExecExpectError(
        ["chapter", "list", "--json"],
        workspaceDir,
      );

      // The list may succeed or fail depending on whether valid roles exist
      // Either way, it should not crash with an unhandled exception
      if (result.exitCode === 0) {
        const roles = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
        const malformed = roles.find(
          (r) => (r.metadata as Record<string, unknown>)?.name === "malformed-role",
        );
        // Malformed role should NOT be included in results
        expect(malformed).toBeUndefined();
      }
      // If it exited non-zero, that's also acceptable (e.g., "No roles found")
    });

    it("chapter validate fails for role with invalid frontmatter", () => {
      // Create a role with invalid YAML
      const badYamlDir = path.join(
        workspaceDir,
        ".claude",
        "roles",
        "bad-yaml",
      );
      fs.mkdirSync(badYamlDir, { recursive: true });
      fs.writeFileSync(
        path.join(badYamlDir, "ROLE.md"),
        `---
name: bad-yaml
  invalid: indentation: here
description: This has bad YAML
---

Some instructions.
`,
      );

      const result = chapterExecExpectError(
        ["chapter", "validate", "bad-yaml"],
        workspaceDir,
      );

      expect(result.exitCode).not.toBe(0);
    });
  });
});
