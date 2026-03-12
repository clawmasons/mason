/**
 * E2E Test: MCP Note Taker — Full Pipeline
 *
 * Exercises the full role-based pipeline without requiring an LLM token:
 *   1. Copy fixture workspace to temp dir
 *   2. Run `chapter build` (resolve + pack + docker-init)
 *   3. Start proxy, connect MCP client, call all filesystem tools
 *
 * PRD refs: UC-1 (Local Role Development), UC-4 (Docker Containerization)
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

// -- Shared Setup -------------------------------------------------------------

describe("role-based note-taker e2e", () => {
  let workspaceDir: string;
  let dockerDir: string;
  let notesDir: string;

  beforeAll(async () => {
    // Copy fixtures excluding mcp-test (wildcard permissions break docker-init)
    workspaceDir = copyFixtureWorkspace("mcp-note-taker", {
      excludePaths: ["agents/mcp-test", "roles/mcp-test"],
    });

    // Build: resolve + pack + docker-init
    chapterExec(["chapter", "build"], workspaceDir, { timeout: 120_000 });

    dockerDir = path.join(workspaceDir, "docker");

    // Create notes directory required by the filesystem MCP server
    notesDir = path.join(workspaceDir, "notes");
    fs.mkdirSync(notesDir, { recursive: true });
  }, 120_000);

  afterAll(() => {
    if (workspaceDir && fs.existsSync(workspaceDir)) {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  // -- Build Output Verification ----------------------------------------------

  describe("build output", () => {
    it("generates agent Dockerfile for writer role", () => {
      expect(
        fs.existsSync(
          path.join(dockerDir, "agent", "writer", "writer", "Dockerfile"),
        ),
      ).toBe(true);
    });

    it("generates workspace for writer role", () => {
      const wsDir = path.join(
        dockerDir, "agent", "writer", "writer", "workspace",
      );
      expect(fs.existsSync(wsDir)).toBe(true);
    });

    it("generates proxy Dockerfile for writer role", () => {
      expect(
        fs.existsSync(path.join(dockerDir, "proxy", "writer", "Dockerfile")),
      ).toBe(true);
    });
  });

  // -- Proxy Tool Pipeline ----------------------------------------------------

  describe("proxy tool pipeline", () => {
    const PROXY_PORT = 19600;
    const PROXY_TOKEN = crypto.randomBytes(32).toString("hex");
    const CRED_TOKEN = crypto.randomBytes(32).toString("hex");
    const COMPOSE_PROJECT = `chapter-mcp-e2e-proxy-${Date.now()}`;
    let composeFile: string;

    beforeAll(() => {
      const composeContent = `# Generated for note-taker proxy e2e test
services:
  proxy-writer:
    build:
      context: "${dockerDir}"
      dockerfile: "proxy/writer/Dockerfile"
    ports:
      - "${PROXY_PORT}:9090"
    volumes:
      - "${workspaceDir}:/workspace"
      - "${notesDir}:/app/notes"
    environment:
      - CHAPTER_PROXY_TOKEN=${PROXY_TOKEN}
      - CREDENTIAL_PROXY_TOKEN=${CRED_TOKEN}
    command: ["chapter", "proxy", "--role", "@test/role-writer", "--transport", "streamable-http"]
    restart: "no"

  credential-service:
    build:
      context: "${dockerDir}"
      dockerfile: "credential-service/Dockerfile"
    environment:
      - CREDENTIAL_PROXY_TOKEN=${CRED_TOKEN}
    depends_on:
      - proxy-writer
    restart: "no"
`;
      const composeDir = path.join(workspaceDir, "e2e-compose-proxy");
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

    it("builds Docker images", () => {
      execSync(
        `docker compose -p ${COMPOSE_PROJECT} -f "${composeFile}" build`,
        { cwd: dockerDir, stdio: "pipe", timeout: 180_000 },
      );
    }, 190_000);

    it("starts proxy and credential service", () => {
      execSync(
        `docker compose -p ${COMPOSE_PROJECT} -f "${composeFile}" up -d proxy-writer credential-service`,
        { stdio: "pipe", timeout: 60_000 },
      );

      const ps = execSync(
        `docker compose -p ${COMPOSE_PROJECT} -f "${composeFile}" ps --format json`,
        { stdio: "pipe", timeout: 10_000 },
      ).toString();
      expect(ps).toContain("proxy-writer");
    }, 65_000);

    it("proxy health endpoint responds", async () => {
      await waitForHealth(`http://localhost:${PROXY_PORT}/health`, 30_000, {
        composeProject: COMPOSE_PROJECT,
        composeFile,
        service: "proxy-writer",
      });
    }, 35_000);

    it("MCP client lists governed filesystem tools", async () => {
      const client = new Client({ name: "mcp-e2e-test", version: "0.1.0" });
      const transport = new StreamableHTTPClientTransport(
        new URL(`http://localhost:${PROXY_PORT}/mcp`),
        {
          requestInit: {
            headers: { Authorization: `Bearer ${PROXY_TOKEN}` },
          },
        },
      );
      await client.connect(transport);

      const result = await client.listTools();
      expect(result).toHaveProperty("tools");
      expect(Array.isArray(result.tools)).toBe(true);

      // Verify filesystem tools are present (prefixed with app name)
      const toolNames = result.tools.map((t) => t.name);
      expect(toolNames.some((n) => n.includes("read_file"))).toBe(true);
      expect(toolNames.some((n) => n.includes("write_file"))).toBe(true);
      expect(toolNames.some((n) => n.includes("list_directory"))).toBe(true);
      expect(toolNames.some((n) => n.includes("create_directory"))).toBe(true);

      await client.close();
    }, 30_000);

    it("calls list_directory through governed proxy", async () => {
      const client = new Client({ name: "mcp-e2e-listdir", version: "0.1.0" });
      const transport = new StreamableHTTPClientTransport(
        new URL(`http://localhost:${PROXY_PORT}/mcp`),
        {
          requestInit: {
            headers: { Authorization: `Bearer ${PROXY_TOKEN}` },
          },
        },
      );
      await client.connect(transport);

      const toolsResult = await client.listTools();
      const listDirTool = toolsResult.tools.find(
        (t) => t.name.includes("list_directory") && !t.name.includes("list_allowed"),
      );
      expect(listDirTool).toBeDefined();

      if (listDirTool) {
        const callResult = await client.callTool({
          name: listDirTool.name,
          arguments: { path: "/workspace" },
        });
        expect(callResult).toHaveProperty("content");
      }

      await client.close();
    }, 30_000);

    it("calls write_file then read_file through governed proxy", async () => {
      const client = new Client({ name: "mcp-e2e-readwrite", version: "0.1.0" });
      const transport = new StreamableHTTPClientTransport(
        new URL(`http://localhost:${PROXY_PORT}/mcp`),
        {
          requestInit: {
            headers: { Authorization: `Bearer ${PROXY_TOKEN}` },
          },
        },
      );
      await client.connect(transport);

      const toolsResult = await client.listTools();

      // Write a test note
      const writeTool = toolsResult.tools.find((t) => t.name.includes("write_file"));
      expect(writeTool).toBeDefined();

      if (writeTool) {
        const writeResult = await client.callTool({
          name: writeTool.name,
          arguments: {
            path: "/app/notes/e2e-test-note.md",
            content: "# E2E Test Note\n\nWritten by note-taker e2e test.",
          },
        });
        expect(writeResult).toHaveProperty("content");
      }

      // Read it back
      const readTool = toolsResult.tools.find((t) => t.name.includes("read_file"));
      expect(readTool).toBeDefined();

      if (readTool) {
        const readResult = await client.callTool({
          name: readTool.name,
          arguments: { path: "/app/notes/e2e-test-note.md" },
        });
        expect(readResult).toHaveProperty("content");
        const textContent = JSON.stringify(readResult.content);
        expect(textContent).toContain("E2E Test Note");
      }

      await client.close();
    }, 30_000);

    it("calls create_directory through governed proxy", async () => {
      const client = new Client({ name: "mcp-e2e-mkdir", version: "0.1.0" });
      const transport = new StreamableHTTPClientTransport(
        new URL(`http://localhost:${PROXY_PORT}/mcp`),
        {
          requestInit: {
            headers: { Authorization: `Bearer ${PROXY_TOKEN}` },
          },
        },
      );
      await client.connect(transport);

      const toolsResult = await client.listTools();
      const mkdirTool = toolsResult.tools.find((t) => t.name.includes("create_directory"));
      expect(mkdirTool).toBeDefined();

      if (mkdirTool) {
        const callResult = await client.callTool({
          name: mkdirTool.name,
          arguments: { path: "/app/notes/e2e-subdir" },
        });
        expect(callResult).toHaveProperty("content");
      }

      await client.close();
    }, 30_000);
  });
});
