/**
 * E2E Test: Full chapter build → run validation flow
 *
 * Exercises the real pipeline:
 *   1. Copy fixture workspace to temp dir
 *   2. Run `chapter build` (resolve + docker build dir generation)
 *   3. Validate Docker artifacts, Dockerfiles, and workspace materialization
 *   4. Validate that run prerequisites (Dockerfiles) exist
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

describe("full chapter build → run validation flow", () => {
  let workspaceDir: string;
  let dockerDir: string;

  // The local role "test-writer" is in .claude/roles/test-writer/ROLE.md
  // Agent type inferred from .claude/ directory → "claude-code"
  const ROLE_NAME = "test-writer";
  const AGENT_TYPE = "claude-code";

  beforeAll(async () => {
    // 1. Create temp workspace from fixtures
    workspaceDir = copyFixtureWorkspace("build-pipeline", {
      excludePaths: ["agents/mcp-test", "roles/mcp-test"],
    });

    // 2. Run chapter build
    chapterExec(["chapter", "build"], workspaceDir, { timeout: 120_000 });

    dockerDir = path.join(workspaceDir, ".clawmasons", "docker");
  }, 120_000);

  afterAll(() => {
    if (workspaceDir && fs.existsSync(workspaceDir)) {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  // -- Docker Build Directory --------------------------------------------------

  describe("docker build directory", () => {
    it("creates .clawmasons/docker/ directory", () => {
      expect(fs.existsSync(dockerDir)).toBe(true);
    });

    it("creates role-specific build directory", () => {
      expect(fs.existsSync(path.join(dockerDir, ROLE_NAME))).toBe(true);
    });
  });

  // -- Proxy Dockerfile -------------------------------------------------------

  describe("docker-init proxy output", () => {
    it("generates mcp-proxy/Dockerfile", () => {
      expect(
        fs.existsSync(path.join(dockerDir, ROLE_NAME, "mcp-proxy", "Dockerfile")),
      ).toBe(true);
    });

    it("proxy Dockerfile has correct structure", () => {
      const dockerfile = fs.readFileSync(
        path.join(dockerDir, ROLE_NAME, "mcp-proxy", "Dockerfile"),
        "utf-8",
      );
      expect(dockerfile).toContain("FROM node:");
    });
  });

  // -- Agent Dockerfile -------------------------------------------------------

  describe("docker-init agent output", () => {
    it("generates agent-type/Dockerfile", () => {
      expect(
        fs.existsSync(
          path.join(dockerDir, ROLE_NAME, AGENT_TYPE, "Dockerfile"),
        ),
      ).toBe(true);
    });

    it("agent Dockerfile has correct structure", () => {
      const dockerfile = fs.readFileSync(
        path.join(dockerDir, ROLE_NAME, AGENT_TYPE, "Dockerfile"),
        "utf-8",
      );
      expect(dockerfile).toContain("FROM ");
    });
  });

  // -- Workspace Materialization -----------------------------------------------

  describe("workspace materialization", () => {
    it("generates workspace files", () => {
      const wsDir = path.join(
        dockerDir, ROLE_NAME, AGENT_TYPE, "workspace",
      );
      expect(fs.existsSync(wsDir)).toBe(true);
    });
  });

  // -- Run Prerequisites -------------------------------------------------------

  describe("run prerequisites", () => {
    it("proxy Dockerfile exists for role", () => {
      expect(
        fs.existsSync(path.join(dockerDir, ROLE_NAME, "mcp-proxy", "Dockerfile")),
      ).toBe(true);
    });

    it("agent Dockerfile exists for role", () => {
      expect(
        fs.existsSync(
          path.join(dockerDir, ROLE_NAME, AGENT_TYPE, "Dockerfile"),
        ),
      ).toBe(true);
    });
  });

  // -- Proxy Boot + MCP Connectivity ------------------------------------------

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
      // Proxy build context is dockerDir, dockerfile is relative
      const composeContent = `# Generated for e2e proxy boot test
services:
  proxy-${ROLE_NAME}:
    build:
      context: "${dockerDir}"
      dockerfile: "${ROLE_NAME}/mcp-proxy/Dockerfile"
    ports:
      - "${TEST_PORT}:9090"
    volumes:
      - "${workspaceDir}:/home/mason/workspace/project"
      - "${path.join(workspaceDir, "notes")}:/app/notes"
    environment:
      - CHAPTER_PROXY_TOKEN=${PROXY_TOKEN}
    command: ["chapter", "proxy", "--role", "@test/role-writer", "--transport", "streamable-http"]
    restart: "no"
`;
      const composeDir = path.join(workspaceDir, "e2e-compose");
      fs.mkdirSync(composeDir, { recursive: true });
      composeFile = path.join(composeDir, "docker-compose.yml");
      fs.writeFileSync(composeFile, composeContent);
    });

    afterAll(() => {
      try {
        execSync(
          `docker compose -p ${COMPOSE_PROJECT} -f "${composeFile}" down --rmi local --volumes`,
          { stdio: "pipe", timeout: 60_000 },
        );
      } catch { /* best-effort cleanup */ }
    });

    it("builds proxy Docker image", () => {
      execSync(
        `docker compose -p ${COMPOSE_PROJECT} -f "${composeFile}" build proxy-${ROLE_NAME}`,
        { cwd: dockerDir, stdio: "pipe", timeout: 120_000 },
      );
    }, 130_000);

    it("starts proxy container", () => {
      execSync(
        `docker compose -p ${COMPOSE_PROJECT} -f "${composeFile}" up -d proxy-${ROLE_NAME}`,
        { stdio: "pipe", timeout: 60_000 },
      );

      const ps = execSync(
        `docker compose -p ${COMPOSE_PROJECT} -f "${composeFile}" ps --format json`,
        { stdio: "pipe", timeout: 10_000 },
      ).toString();
      expect(ps).toContain(`proxy-${ROLE_NAME}`);
    }, 65_000);

    it("proxy health endpoint responds", async () => {
      await waitForHealth(`http://localhost:${TEST_PORT}/health`, 30_000, {
        composeProject: COMPOSE_PROJECT,
        composeFile,
        service: `proxy-${ROLE_NAME}`,
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
