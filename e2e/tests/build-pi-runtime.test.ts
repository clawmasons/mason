/**
 * E2E Test: Note-Taker Agent on Pi-Coding-Agent with OpenRouter
 *
 * Validates that the chapter CLI can build, validate, list, and generate
 * Docker artifacts for a pi-coding-agent agent with OpenRouter LLM config.
 *
 * All setup and generation is done exclusively via `chapter build`.
 * Tests verify CLI output: exit codes, generated files, and command output.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  E2E_ROOT,
  copyFixtureWorkspace,
  chapterExec,
  chapterExecJson,
} from "./helpers.js";

describe("note-taker on pi-coding-agent with OpenRouter", () => {
  let workspaceDir: string;
  let dockerDir: string;

  beforeAll(() => {
    // 1. Create temp workspace from fixtures
    workspaceDir = copyFixtureWorkspace("build-pi-runtime");

    // 2. Run chapter build (resolve + pack + docker-init)
    chapterExec(["chapter", "build", "@test/agent-test-note-taker"], workspaceDir, {
      timeout: 120_000,
    });

    dockerDir = path.join(workspaceDir, "docker");
  }, 120_000);

  afterAll(() => {
    if (workspaceDir && fs.existsSync(workspaceDir)) {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  // ── Build Output ─────────────────────────────────────────────────────

  describe("build output", () => {
    it("generates chapter.lock.json", () => {
      const lockPath = path.join(workspaceDir, "chapter.lock.json");
      expect(fs.existsSync(lockPath)).toBe(true);
    });

    it("lock file has correct structure", () => {
      const lock = JSON.parse(
        fs.readFileSync(path.join(workspaceDir, "chapter.lock.json"), "utf-8"),
      );

      expect(lock.lockVersion).toBe(1);
      expect(lock.agent.name).toBe("@test/agent-test-note-taker");
      expect(lock.agent.runtimes).toContain("pi-coding-agent");
    });

    it("lock file contains writer role with dependencies", () => {
      const lock = JSON.parse(
        fs.readFileSync(path.join(workspaceDir, "chapter.lock.json"), "utf-8"),
      );

      expect(lock.roles).toHaveLength(1);
      const writerRole = lock.roles[0];
      expect(writerRole.name).toBe("@test/role-writer");
      expect(writerRole.tasks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "@test/task-take-notes" }),
        ]),
      );
    });
  });

  // ── Docker Init — Proxy ──────────────────────────────────────────────

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

  // ── Docker Init — Agent ──────────────────────────────────────────────

  describe("docker-init agent output", () => {
    it("generates agent/test-note-taker/writer/Dockerfile", () => {
      expect(
        fs.existsSync(
          path.join(dockerDir, "agent", "test-note-taker", "writer", "Dockerfile"),
        ),
      ).toBe(true);
    });

    it("agent Dockerfile installs pi-coding-agent runtime", () => {
      const dockerfile = fs.readFileSync(
        path.join(
          dockerDir, "agent", "test-note-taker", "writer", "Dockerfile",
        ),
        "utf-8",
      );
      expect(dockerfile).toContain(
        "npm install -g @mariozechner/pi-coding-agent",
      );
      expect(dockerfile).toContain("COPY node_modules/");
      expect(dockerfile).not.toContain("npm install --omit=dev");
    });
  });

  // ── Workspace Materialization ────────────────────────────────────────

  describe("workspace materialization", () => {
    const workspacePath = () =>
      path.join(dockerDir, "agent", "test-note-taker", "writer", "workspace");

    it("generates AGENTS.md", () => {
      expect(fs.existsSync(path.join(workspacePath(), "AGENTS.md"))).toBe(true);
    });

    it("AGENTS.md contains agent identity and role-writer context", () => {
      const agentsMd = fs.readFileSync(
        path.join(workspacePath(), "AGENTS.md"),
        "utf-8",
      );

      expect(agentsMd).toContain("# Agent:");
      expect(agentsMd).toContain("managed by chapter");
      expect(agentsMd).toContain("writer");
      expect(agentsMd).toContain("Permitted tools");
      expect(agentsMd).toContain("filesystem");
    });

    it("generates .pi/settings.json with correct model ID", () => {
      const settingsPath = path.join(workspacePath(), ".pi", "settings.json");
      expect(fs.existsSync(settingsPath)).toBe(true);

      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      expect(settings.model).toBe("openrouter/anthropic/claude-sonnet-4");
    });

    it("generates .pi/mcp.json with MCP server config", () => {
      const mcpJsonPath = path.join(workspacePath(), ".pi", "mcp.json");
      expect(fs.existsSync(mcpJsonPath)).toBe(true);

      const mcpJson = JSON.parse(fs.readFileSync(mcpJsonPath, "utf-8"));
      expect(mcpJson.mcpServers.chapter).toBeDefined();
      expect(mcpJson.mcpServers.chapter.url).toContain("/sse");
    });

    it("generates .pi/extensions/chapter-mcp/index.ts", () => {
      const indexTsPath = path.join(
        workspacePath(), ".pi", "extensions", "chapter-mcp", "index.ts",
      );
      expect(fs.existsSync(indexTsPath)).toBe(true);
    });

    it("extension code registers take-notes command", () => {
      const indexTs = fs.readFileSync(
        path.join(
          workspacePath(), ".pi", "extensions", "chapter-mcp", "index.ts",
        ),
        "utf-8",
      );

      expect(indexTs).toContain("pi.registerCommand(");
      expect(indexTs).toContain('"take-notes"');
    });

    it("generates skills/markdown-conventions/README.md", () => {
      const skillPath = path.join(
        workspacePath(), "skills", "markdown-conventions", "README.md",
      );
      expect(fs.existsSync(skillPath)).toBe(true);

      const content = fs.readFileSync(skillPath, "utf-8");
      expect(content).toContain("markdown-conventions");
      expect(content).toContain("Markdown formatting conventions");
    });
  });

  // ── Validate & List ──────────────────────────────────────────────────

  describe("validate and list", () => {
    it("chapter validate exits 0", () => {
      chapterExec(["chapter", "validate", "@test/agent-test-note-taker"], workspaceDir);
    });

    it("chapter list --json includes the agent", () => {
      const agents = chapterExecJson<unknown[]>(["chapter", "list", "--json"], workspaceDir);

      expect(agents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "@test/agent-test-note-taker" }),
        ]),
      );
    });
  });

  // ── Infrastructure (gated) ──────────────────────────────────────────

  describe("infrastructure (requires Docker)", () => {
    it.skip("pi agent can connect to chapter proxy via Docker Compose", () => {
      // Future: Start docker compose, verify pi connects to MCP proxy
    });
  });

  describe("infrastructure (requires OPENROUTER_API_KEY)", () => {
    it.skip("pi agent can execute a note-taking task", () => {
      // Future: Start docker compose with OPENROUTER_API_KEY
    });
  });
});
