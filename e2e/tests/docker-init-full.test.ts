/**
 * E2E Test: Full docker-init → run-init → run-agent validation flow
 *
 * Exercises the real pipeline:
 *   1. Copy fixture workspace to temp dir
 *   2. Run `chapter pack` to create dist/*.tgz
 *   3. Run `chapter docker-init` (copies framework packages + extracts tgz + generates Dockerfiles)
 *   4. Create a separate "runner" project directory
 *   5. Run `run-init` programmatically (inject promptFn)
 *   6. Validate that `run-agent` prerequisites are satisfied
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runRunInit } from "../../packages/cli/src/cli/commands/run-init.js";
import { readRunConfig, validateDockerfiles } from "../../packages/cli/src/cli/commands/run-agent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const E2E_ROOT = path.resolve(__dirname, "..");
const PROJECT_ROOT = path.resolve(E2E_ROOT, "..");
const FIXTURES_DIR = path.join(E2E_ROOT, "fixtures", "test-chapter");
const CHAPTER_BIN = path.join(PROJECT_ROOT, "bin", "chapter.js");

/** Workspace directories to copy from fixtures. */
const WORKSPACE_DIRS = ["apps", "tasks", "skills", "roles", "agents", ".clawmasons"];

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

describe("full docker-init → run-init → run-agent flow", () => {
  let workspaceDir: string;
  let dockerDir: string;
  let runnerDir: string;

  beforeAll(async () => {
    const timestamp = Date.now();

    // 1. Create temp workspace and copy fixture tree
    workspaceDir = path.join(E2E_ROOT, "tmp", `docker-init-full-${timestamp}`);
    fs.mkdirSync(workspaceDir, { recursive: true });

    // Copy root package.json
    fs.copyFileSync(
      path.join(FIXTURES_DIR, "package.json"),
      path.join(workspaceDir, "package.json"),
    );

    // Copy workspace directories
    for (const wsDir of WORKSPACE_DIRS) {
      const fixtureSrc = path.join(FIXTURES_DIR, wsDir);
      const workspaceDest = path.join(workspaceDir, wsDir);
      if (fs.existsSync(fixtureSrc)) {
        copyDirRecursive(fixtureSrc, workspaceDest);
      } else {
        fs.mkdirSync(workspaceDest, { recursive: true });
      }
    }

    // 2. Run chapter pack (creates dist/*.tgz)
    execFileSync(
      "node",
      [CHAPTER_BIN, "pack"],
      {
        cwd: workspaceDir,
        stdio: "pipe",
        timeout: 60_000,
      },
    );

    // 3. Run chapter docker-init (copies framework packages, extracts tgz, generates Dockerfiles)
    execFileSync(
      "node",
      [CHAPTER_BIN, "docker-init"],
      {
        cwd: workspaceDir,
        stdio: "pipe",
        timeout: 60_000,
      },
    );

    dockerDir = path.join(workspaceDir, "docker");

    // 4. Create a runner project directory
    runnerDir = path.join(E2E_ROOT, "tmp", `runner-${timestamp}`);
    fs.mkdirSync(runnerDir, { recursive: true });

    // 5. Run run-init with injected promptFn
    await runRunInit(runnerDir, {
      promptFn: async () => dockerDir,
    });
  }, 120_000);

  afterAll(() => {
    if (workspaceDir && fs.existsSync(workspaceDir)) {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
    if (runnerDir && fs.existsSync(runnerDir)) {
      fs.rmSync(runnerDir, { recursive: true, force: true });
    }
  });

  // ── Pack Output ───────────────────────────────────────────────────────

  describe("pack output", () => {
    it("creates dist/ with .tgz files", () => {
      const distDir = path.join(workspaceDir, "dist");
      expect(fs.existsSync(distDir)).toBe(true);
      const tgzFiles = fs.readdirSync(distDir).filter((f) => f.endsWith(".tgz"));
      expect(tgzFiles.length).toBeGreaterThan(0);
    });
  });

  // ── Docker Init — node_modules ────────────────────────────────────────

  describe("docker/node_modules population", () => {
    it("has @clawmasons/chapter", () => {
      expect(
        fs.existsSync(path.join(dockerDir, "node_modules", "@clawmasons", "chapter", "package.json")),
      ).toBe(true);
    });

    it("has @clawmasons/proxy", () => {
      expect(
        fs.existsSync(path.join(dockerDir, "node_modules", "@clawmasons", "proxy", "package.json")),
      ).toBe(true);
    });

    it("has @clawmasons/shared", () => {
      expect(
        fs.existsSync(path.join(dockerDir, "node_modules", "@clawmasons", "shared", "package.json")),
      ).toBe(true);
    });

    it("has chapter packages from dist/*.tgz", () => {
      expect(
        fs.existsSync(path.join(dockerDir, "node_modules", "@test", "agent-test-note-taker", "package.json")),
      ).toBe(true);
      expect(
        fs.existsSync(path.join(dockerDir, "node_modules", "@test", "role-writer", "package.json")),
      ).toBe(true);
      expect(
        fs.existsSync(path.join(dockerDir, "node_modules", "@test", "task-take-notes", "package.json")),
      ).toBe(true);
    });

    it("has .bin/chapter symlink", () => {
      const chapterBin = path.join(dockerDir, "node_modules", ".bin", "chapter");
      expect(fs.existsSync(chapterBin)).toBe(true);
    });

    it("has transitive dependencies (e.g., commander, zod)", () => {
      // These are transitive deps of @clawmasons/chapter, @clawmasons/proxy, etc.
      const nmDir = path.join(dockerDir, "node_modules");
      const hasSomeDeps =
        fs.existsSync(path.join(nmDir, "commander")) ||
        fs.existsSync(path.join(nmDir, "zod")) ||
        fs.existsSync(path.join(nmDir, "better-sqlite3"));
      expect(hasSomeDeps).toBe(true);
    });
  });

  // ── Docker Init — Proxy Dockerfile ────────────────────────────────────

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
      expect(dockerfile).toContain("COPY node_modules/");
      expect(dockerfile).toContain("npm rebuild better-sqlite3");
      expect(dockerfile).not.toContain("npm install --omit=dev");
    });
  });

  // ── Docker Init — Agent Dockerfile ────────────────────────────────────

  describe("docker-init agent output", () => {
    it("generates agent/test-note-taker/writer/Dockerfile", () => {
      expect(
        fs.existsSync(
          path.join(dockerDir, "agent", "test-note-taker", "writer", "Dockerfile"),
        ),
      ).toBe(true);
    });

    it("agent Dockerfile has correct structure", () => {
      const dockerfile = fs.readFileSync(
        path.join(dockerDir, "agent", "test-note-taker", "writer", "Dockerfile"),
        "utf-8",
      );
      expect(dockerfile).toContain("COPY node_modules/");
      expect(dockerfile).not.toContain("npm install --omit=dev");
      expect(dockerfile).not.toContain("npm rebuild");
    });
  });

  // ── Docker Init — Workspace ───────────────────────────────────────────

  describe("workspace materialization", () => {
    it("generates workspace files", () => {
      const wsDir = path.join(
        dockerDir, "agent", "test-note-taker", "writer", "workspace",
      );
      expect(fs.existsSync(wsDir)).toBe(true);
    });
  });

  // ── Run Init ──────────────────────────────────────────────────────────

  describe("run-init output", () => {
    it("creates .clawmasons/chapter.json in runner project", () => {
      const configPath = path.join(runnerDir, ".clawmasons", "chapter.json");
      expect(fs.existsSync(configPath)).toBe(true);
    });

    it("runner config has correct docker-build path", () => {
      const config = readRunConfig(runnerDir);
      expect(config["docker-build"]).toBe(dockerDir);
      expect(config.chapter).toBe("test.chapter");
    });

    it("creates .clawmasons/logs/ directory", () => {
      expect(
        fs.existsSync(path.join(runnerDir, ".clawmasons", "logs")),
      ).toBe(true);
    });

    it("creates .clawmasons/workspace/ directory", () => {
      expect(
        fs.existsSync(path.join(runnerDir, ".clawmasons", "workspace")),
      ).toBe(true);
    });
  });

  // ── Run Agent Validation ──────────────────────────────────────────────

  describe("run-agent prerequisites", () => {
    it("validateDockerfiles succeeds for test-note-taker/writer", () => {
      const result = validateDockerfiles(dockerDir, "test-note-taker", "writer");
      expect(result.proxyDockerfile).toContain("proxy/writer/Dockerfile");
      expect(result.agentDockerfile).toContain("agent/test-note-taker/writer/Dockerfile");
    });
  });
});
