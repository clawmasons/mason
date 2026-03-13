/**
 * E2E Test: Role-based build with workspace packages
 *
 * Validates that the chapter CLI can build, validate, list, and generate
 * Docker artifacts for roles discovered from the workspace.
 *
 * All setup and generation is done exclusively via `chapter build`.
 * Tests verify CLI output: exit codes, generated files, and command output.
 *
 * NOTE: This test replaces the former pi-coding-agent runtime test. With the
 * role-based pipeline (Changes 1-11), runtime selection happens at run time
 * (`clawmasons run <agent-type> --role <name>`), not at build time.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  copyFixtureWorkspace,
  chapterExec,
  chapterExecJson,
} from "./helpers.js";

describe("role-based build with workspace packages", () => {
  let workspaceDir: string;
  let dockerDir: string;

  beforeAll(() => {
    // 1. Create temp workspace from fixtures (excludes mcp-test due to wildcard permissions)
    workspaceDir = copyFixtureWorkspace("build-role", {
      excludePaths: ["agents/mcp-test", "roles/mcp-test"],
    });

    // 2. Run chapter build (discovers local ROLE.md, packs workspace packages, docker-init)
    chapterExec(["chapter", "build"], workspaceDir, {
      timeout: 120_000,
    });

    dockerDir = path.join(workspaceDir, ".clawmasons", "docker");
  }, 120_000);

  afterAll(() => {
    if (workspaceDir && fs.existsSync(workspaceDir)) {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  // -- Build Output -----------------------------------------------------------

  describe("build output", () => {
    it("generates .clawmasons/docker/ directory", () => {
      expect(fs.existsSync(dockerDir)).toBe(true);
    });

    it("generates role-specific build directory", () => {
      expect(fs.existsSync(path.join(dockerDir, "test-writer"))).toBe(true);
    });

    it("populates proxy node_modules", () => {
      const nmDir = path.join(dockerDir, "node_modules", "@clawmasons", "chapter");
      expect(fs.existsSync(nmDir)).toBe(true);
    });
  });

  // -- Docker Init — Proxy ----------------------------------------------------

  describe("docker-init proxy output", () => {
    it("generates test-writer/mcp-proxy/Dockerfile", () => {
      expect(
        fs.existsSync(path.join(dockerDir, "test-writer", "mcp-proxy", "Dockerfile")),
      ).toBe(true);
    });

    it("proxy Dockerfile has correct structure", () => {
      const dockerfile = fs.readFileSync(
        path.join(dockerDir, "test-writer", "mcp-proxy", "Dockerfile"),
        "utf-8",
      );
      expect(dockerfile).toContain("FROM node:");
      expect(dockerfile).toContain("USER mason");
      expect(dockerfile).toContain("clawmasons");
      expect(dockerfile).toContain("proxy");
      expect(dockerfile).toContain("npm rebuild");
    });
  });

  // -- Docker Init — Agent ----------------------------------------------------

  describe("docker-init agent output", () => {
    it("generates test-writer/claude-code/Dockerfile", () => {
      expect(
        fs.existsSync(
          path.join(dockerDir, "test-writer", "claude-code", "Dockerfile"),
        ),
      ).toBe(true);
    });

    it("agent Dockerfile has correct structure", () => {
      const dockerfile = fs.readFileSync(
        path.join(
          dockerDir, "test-writer", "claude-code", "Dockerfile",
        ),
        "utf-8",
      );
      expect(dockerfile).toContain("npm install");
    });
  });

  // -- Workspace Materialization ----------------------------------------------

  describe("workspace materialization", () => {
    const workspacePath = () =>
      path.join(dockerDir, "test-writer", "claude-code", "workspace");

    it("generates AGENTS.md", () => {
      expect(fs.existsSync(path.join(workspacePath(), "AGENTS.md"))).toBe(true);
    });

    it("AGENTS.md contains role identity and permissions", () => {
      const agentsMd = fs.readFileSync(
        path.join(workspacePath(), "AGENTS.md"),
        "utf-8",
      );

      expect(agentsMd).toContain("writer");
      expect(agentsMd).toContain("Permitted tools");
      expect(agentsMd).toContain("filesystem");
    });

    it("AGENTS.md references the role name", () => {
      const agentsMd = fs.readFileSync(
        path.join(workspacePath(), "AGENTS.md"),
        "utf-8",
      );
      expect(agentsMd).toContain("test-writer");
    });
  });

  // -- Validate & List --------------------------------------------------------

  describe("validate and list", () => {
    it("chapter validate exits 0 for the local role", () => {
      chapterExec(["chapter", "validate", "test-writer"], workspaceDir);
    });

    it("chapter list --json includes the local role", () => {
      const roles = chapterExecJson<unknown[]>(["chapter", "list", "--json"], workspaceDir);

      expect(roles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            metadata: expect.objectContaining({ name: "test-writer" }),
          }),
        ]),
      );
    });
  });
});
