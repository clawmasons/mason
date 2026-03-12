/**
 * E2E Test: Docker Proxy with ACP Session Metadata
 *
 * Exercises the proxy Docker pipeline end-to-end:
 *   1. Copy fixture workspace to temp dir
 *   2. Run `chapter build` (resolve + pack + docker-init)
 *   3. Start proxy container with ACP session metadata
 *   4. Connect MCP client and verify governed tools
 *   5. Make tool calls through the governed proxy
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

// -- Docker Proxy E2E with ACP Session Metadata -------------------------------

describe("ACP proxy Docker e2e", () => {
  let workspaceDir: string;
  let dockerDir: string;

  const TEST_PORT = 19500;
  const PROXY_TOKEN = crypto.randomBytes(32).toString("hex");
  const ACP_CLIENT_NAME = "e2e-test-editor";
  const COMPOSE_PROJECT = `chapter-acp-e2e-${Date.now()}`;
  let composeFile: string;

  beforeAll(async () => {
    // 1. Create temp workspace from fixtures, excluding mcp-test
    workspaceDir = copyFixtureWorkspace("docker-proxy", {
      excludePaths: ["agents/mcp-test", "roles/mcp-test"],
    });

    // 2. Run chapter build (resolve + pack + docker-init in one step)
    chapterExec(["chapter", "build"], workspaceDir, { timeout: 120_000 });

    dockerDir = path.join(workspaceDir, "docker");

    // Create notes directory required by the filesystem MCP server
    const notesDir = path.join(workspaceDir, "notes");
    fs.mkdirSync(notesDir, { recursive: true });

    // 3. Generate docker-compose with ACP session env vars
    const composeContent = `# Generated for ACP proxy e2e test
services:
  proxy-writer:
    build:
      context: "${dockerDir}"
      dockerfile: "proxy/writer/Dockerfile"
    ports:
      - "${TEST_PORT}:9090"
    volumes:
      - "${workspaceDir}:/workspace"
      - "${notesDir}:/app/notes"
    environment:
      - CHAPTER_PROXY_TOKEN=${PROXY_TOKEN}
      - CHAPTER_SESSION_TYPE=acp
      - CHAPTER_ACP_CLIENT=${ACP_CLIENT_NAME}
    command: ["chapter", "proxy", "--role", "@test/role-writer", "--transport", "streamable-http"]
    restart: "no"
`;
    const composeDir = path.join(workspaceDir, "e2e-compose");
    fs.mkdirSync(composeDir, { recursive: true });
    composeFile = path.join(composeDir, "docker-compose.yml");
    fs.writeFileSync(composeFile, composeContent);
  }, 120_000);

  afterAll(() => {
    // Tear down containers
    try {
      execSync(
        `docker compose -p ${COMPOSE_PROJECT} -f "${composeFile}" down --rmi local --volumes`,
        { stdio: "pipe", timeout: 60_000 },
      );
    } catch { /* best-effort cleanup */ }

    // Clean up temp dirs
    if (workspaceDir && fs.existsSync(workspaceDir)) {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  it("builds proxy Docker image with ACP config", () => {
    execSync(
      `docker compose -p ${COMPOSE_PROJECT} -f "${composeFile}" build proxy-writer`,
      { cwd: dockerDir, stdio: "pipe", timeout: 120_000 },
    );
  }, 130_000);

  it("starts proxy container with ACP session env vars", () => {
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

  it("MCP client connects and lists governed tools", async () => {
    const client = new Client({ name: "acp-e2e-test", version: "0.1.0" });
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
    expect(Array.isArray(result.tools)).toBe(true);

    // The proxy should expose filesystem tools (prefixed with app name)
    if (result.tools.length > 0) {
      const toolNames = result.tools.map((t) => t.name);
      const hasFilesystemTools = toolNames.some(
        (name) => name.includes("filesystem") || name.includes("read_file"),
      );
      expect(hasFilesystemTools).toBe(true);
    }

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
        Authorization: "Bearer wrong-token",
      },
      body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 1, params: {} }),
    });
    expect(resp.status).toBe(401);
  }, 10_000);

  it("tool call through governed proxy succeeds", async () => {
    const client = new Client({ name: "acp-e2e-toolcall", version: "0.1.0" });
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

    // List tools first to find the correct prefixed name
    const toolsResult = await client.listTools();
    const listDirTool = toolsResult.tools.find(
      (t) => t.name.includes("list_directory") || t.name.includes("list_allowed_directories"),
    );

    if (listDirTool) {
      // Call the tool -- this exercises the full governed pipeline
      const callResult = await client.callTool({
        name: listDirTool.name,
        arguments: listDirTool.name.includes("list_allowed_directories")
          ? {}
          : { path: "/workspace" },
      });

      expect(callResult).toHaveProperty("content");
    }

    await client.close();
  }, 30_000);
});
