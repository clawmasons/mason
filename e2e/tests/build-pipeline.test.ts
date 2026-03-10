/**
 * E2E Test: Full chapter build → run-agent validation flow
 *
 * Exercises the real pipeline:
 *   1. Copy fixture workspace to temp dir
 *   2. Run `chapter build` (resolve + pack + docker-init in one step)
 *   3. Validate Docker artifacts, Dockerfiles, and workspace materialization
 *   4. Validate that run-agent prerequisites (Dockerfiles) exist
 *   5. Build and start proxy container, verify MCP connectivity
 *
 * All setup is done exclusively via `chapter build`.
 * Tests verify CLI output: exit codes, generated files, and running containers.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { execSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  copyFixtureWorkspace,
  chapterExec,
  waitForHealth,
} from "./helpers.js";

describe("full chapter build → run-agent validation flow", () => {
  let workspaceDir: string;
  let dockerDir: string;

  beforeAll(async () => {
    // 1. Create temp workspace from fixtures
    workspaceDir = copyFixtureWorkspace("build-pipeline");

    // 2. Run chapter build (resolve + pack + docker-init in one step)
    chapterExec(["build"], workspaceDir, { timeout: 120_000 });

    dockerDir = path.join(workspaceDir, "docker");
  }, 120_000);

  afterAll(() => {
    if (workspaceDir && fs.existsSync(workspaceDir)) {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  // ── Build Output ────────────────────────────────────────────────────

  describe("build output", () => {
    it("creates chapter.lock.json", () => {
      const lockPath = path.join(workspaceDir, "chapter.lock.json");
      expect(fs.existsSync(lockPath)).toBe(true);
    });

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

    it("has .bin/clawmasons symlink", () => {
      const clawmasonsBin = path.join(dockerDir, "node_modules", ".bin", "clawmasons");
      expect(fs.existsSync(clawmasonsBin)).toBe(true);
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

  // ── Run Agent Prerequisites ──────────────────────────────────────────

  describe("run-agent prerequisites", () => {
    it("proxy Dockerfile exists for test-note-taker/writer", () => {
      expect(
        fs.existsSync(path.join(dockerDir, "proxy", "writer", "Dockerfile")),
      ).toBe(true);
    });

    it("agent Dockerfile exists for test-note-taker/writer", () => {
      expect(
        fs.existsSync(
          path.join(dockerDir, "agent", "test-note-taker", "writer", "Dockerfile"),
        ),
      ).toBe(true);
    });
  });

  // ── Proxy Boot + MCP Connectivity ──────────────────────────────────

  describe("proxy boot + MCP connectivity", () => {
    const TEST_PORT = 19400;
    const PROXY_TOKEN = crypto.randomBytes(32).toString("hex");
    const COMPOSE_PROJECT = `chapter-e2e-${Date.now()}`;
    let composeFile: string;

    beforeAll(() => {
      // Create notes directory required by the filesystem MCP server
      const notesDir = path.join(workspaceDir, "notes");
      fs.mkdirSync(notesDir, { recursive: true });

      // Generate a test-specific compose file with port mapping
      const composeContent = `# Generated for e2e proxy boot test
services:
  proxy-writer:
    build:
      context: "${dockerDir}"
      dockerfile: "proxy/writer/Dockerfile"
    ports:
      - "${TEST_PORT}:9090"
    volumes:
      - "${workspaceDir}:/workspace"
      - "${path.join(workspaceDir, "notes")}:/app/notes"
    environment:
      - CHAPTER_PROXY_TOKEN=${PROXY_TOKEN}
    command: ["proxy", "--agent", "@test/agent-test-note-taker", "--transport", "streamable-http"]
    restart: "no"
`;
      const composeDir = path.join(workspaceDir, "e2e-compose");
      fs.mkdirSync(composeDir, { recursive: true });
      composeFile = path.join(composeDir, "docker-compose.yml");
      fs.writeFileSync(composeFile, composeContent);
    });

    afterAll(() => {
      // Tear down containers and images
      try {
        execSync(
          `docker compose -p ${COMPOSE_PROJECT} -f "${composeFile}" down --rmi local --volumes`,
          { stdio: "pipe", timeout: 60_000 },
        );
      } catch { /* best-effort cleanup */ }
    });

    it("builds proxy Docker image", () => {
      execSync(
        `docker compose -p ${COMPOSE_PROJECT} -f "${composeFile}" build proxy-writer`,
        { cwd: dockerDir, stdio: "pipe", timeout: 120_000 },
      );
    }, 130_000);

    it("starts proxy container", () => {
      execSync(
        `docker compose -p ${COMPOSE_PROJECT} -f "${composeFile}" up -d proxy-writer`,
        { stdio: "pipe", timeout: 60_000 },
      );

      // Verify container is running
      const ps = execSync(
        `docker compose -p ${COMPOSE_PROJECT} -f "${composeFile}" ps --format json`,
        { stdio: "pipe", timeout: 10_000 },
      ).toString();
      expect(ps).toContain("proxy-writer");
    }, 65_000);

    it("proxy health endpoint responds", async () => {
      await waitForHealth(`http://localhost:${TEST_PORT}/health`, 30_000, {
        composeProject: COMPOSE_PROJECT,
        composeFile,
        service: "proxy-writer",
      });
    }, 35_000);

    it("MCP client connects with valid token and lists tools", async () => {
      const client = new Client({ name: "e2e-proxy-test", version: "0.1.0" });
      const transport = new StreamableHTTPClientTransport(
        new URL(`http://localhost:${TEST_PORT}/mcp`),
        {
          requestInit: {
            headers: {
              Authorization: `Bearer ${PROXY_TOKEN}`,
            },
          },
        },
      );
      await client.connect(transport);

      const result = await client.listTools();
      // The proxy should respond — tools may or may not be populated
      // depending on upstream app availability, but the call should succeed
      expect(result).toHaveProperty("tools");

      await client.close();
    }, 30_000);

    it("rejects requests without auth token", async () => {
      const resp = await fetch(`http://localhost:${TEST_PORT}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 1, params: {} }),
      });
      expect(resp.status).toBe(401);
    }, 10_000);

    it("rejects requests with wrong auth token", async () => {
      const resp = await fetch(`http://localhost:${TEST_PORT}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer wrong-token",
        },
        body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 1, params: {} }),
      });
      expect(resp.status).toBe(401);
    }, 10_000);
  });
});
