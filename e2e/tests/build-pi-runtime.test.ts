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

    dockerDir = path.join(workspaceDir, "docker");
  }, 120_000);

  afterAll(() => {
    if (workspaceDir && fs.existsSync(workspaceDir)) {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  // -- Build Output -----------------------------------------------------------

  describe("build output", () => {
    it("generates chapter.lock.json", () => {
      const lockPath = path.join(workspaceDir, "chapter.lock.json");
      expect(fs.existsSync(lockPath)).toBe(true);
    });

    it("lock file has correct structure", () => {
      const lock = JSON.parse(
        fs.readFileSync(path.join(workspaceDir, "chapter.lock.json"), "utf-8"),
      );

      expect(lock.lockVersion).toBe(2);
      expect(lock.role.name).toBe("test-writer");
    });

    it("lock file contains tasks from the local role", () => {
      const lock = JSON.parse(
        fs.readFileSync(path.join(workspaceDir, "chapter.lock.json"), "utf-8"),
      );

      expect(lock.tasks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "take-notes" }),
        ]),
      );
    });
  });

  // -- Docker Init — Proxy ----------------------------------------------------

  describe("docker-init proxy output", () => {
    it("generates proxy/writer/Dockerfile", () => {
      expect(
        fs.existsSync(path.join(dockerDir, "proxy", "writer", "Dockerfile")),
      ).toBe(true);
    });

    it("proxy Dockerfile has correct structure", () => {
      const dockerfile = fs.readFileSync(
        path.join(dockerDir, "proxy", "writer", "Dockerfile"),
        "utf-8",
      );
      expect(dockerfile).toContain("FROM node:");
      expect(dockerfile).toContain("USER mason");
      expect(dockerfile).toContain("clawmasons");
      expect(dockerfile).toContain("proxy");
      expect(dockerfile).toContain("COPY node_modules/");
      expect(dockerfile).not.toContain("npm install");
      expect(dockerfile).toContain("npm rebuild better-sqlite3");
    });
  });

  // -- Docker Init — Agent ----------------------------------------------------

  describe("docker-init agent output", () => {
    it("generates agent/writer/writer/Dockerfile", () => {
      expect(
        fs.existsSync(
          path.join(dockerDir, "agent", "writer", "writer", "Dockerfile"),
        ),
      ).toBe(true);
    });

    it("agent Dockerfile has correct structure", () => {
      const dockerfile = fs.readFileSync(
        path.join(
          dockerDir, "agent", "writer", "writer", "Dockerfile",
        ),
        "utf-8",
      );
      expect(dockerfile).toContain("COPY node_modules/");
      expect(dockerfile).not.toContain("npm install --omit=dev");
    });
  });

  // -- Workspace Materialization ----------------------------------------------

  describe("workspace materialization", () => {
    const workspacePath = () =>
      path.join(dockerDir, "agent", "writer", "writer", "workspace");

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

    it("generates skills/markdown-conventions/README.md", () => {
      const skillPath = path.join(
        workspacePath(), "skills", "markdown-conventions", "README.md",
      );
      expect(fs.existsSync(skillPath)).toBe(true);

      const content = fs.readFileSync(skillPath, "utf-8");
      expect(content).toContain("markdown-conventions");
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
