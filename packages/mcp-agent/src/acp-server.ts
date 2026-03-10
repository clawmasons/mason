/**
 * ACP Agent Server — listens for incoming ACP connections and processes
 * tool call requests through the shared tool-caller.
 *
 * For now, this is a simple HTTP server that accepts POST requests with
 * a JSON body: { "command": "<tool_name> <json_args>" }.
 *
 * The full ACP protocol integration will be implemented in CHANGE 7
 * (ACP Bridge) when the wire protocol is defined.
 */

import { createServer, type Server } from "node:http";
import type { ToolCaller, ToolDefinition } from "./tool-caller.js";
import { executeCommand } from "./tool-caller.js";

// ── Types ─────────────────────────────────────────────────────────────

export interface AcpServerConfig {
  port: number;
  caller: ToolCaller;
}

export interface AcpServerHandle {
  close: () => Promise<void>;
}

// ── Implementation ────────────────────────────────────────────────────

/**
 * Start the ACP agent server.
 *
 * Accepts POST / with JSON body { command: string }.
 * Returns JSON { output: string, exit: boolean }.
 * GET / returns a JSON status message.
 */
export async function startAcpServer(config: AcpServerConfig): Promise<AcpServerHandle> {
  const { port, caller } = config;

  // Pre-fetch tools for help messages
  let cachedTools: ToolDefinition[] = [];
  try {
    cachedTools = await caller.listTools();
  } catch {
    // Tools will be fetched on demand
  }

  const server: Server = createServer(async (req, res) => {
    // CORS headers for development
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", mode: "acp", tools: cachedTools.length }));
      return;
    }

    if (req.method === "POST" && req.url === "/") {
      try {
        const body = await readBody(req);
        const parsed = JSON.parse(body) as { command?: string };

        if (!parsed.command || typeof parsed.command !== "string") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing 'command' field in request body" }));
          return;
        }

        const result = await executeCommand(parsed.command, caller, cachedTools);

        // Refresh cached tools after list command
        if (parsed.command.trim() === "list") {
          try {
            cachedTools = await caller.listTools();
          } catch {
            // Keep existing cache
          }
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: msg }));
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  return new Promise<AcpServerHandle>((resolve, reject) => {
    server.on("error", reject);

    server.listen(port, () => {
      console.log(`[mcp-agent] ACP server listening on port ${port}`);
      resolve({
        close: () =>
          new Promise<void>((res, rej) => {
            server.close((err) => {
              if (err) rej(err);
              else res();
            });
          }),
      });
    });
  });
}

// ── Helpers ───────────────────────────────────────────────────────────

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}
