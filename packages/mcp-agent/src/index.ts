/**
 * MCP Agent — General-purpose MCP agent with REPL and ACP modes.
 *
 * Modes:
 *   - REPL (default): Interactive tool-calling interface via stdin/stdout
 *   - ACP (--acp): Listens for incoming ACP connections on a configurable port
 *
 * Environment variables:
 *   - TEST_TOKEN       — credential injected by agent-entry (required)
 *   - MCP_PROXY_URL    — proxy URL (default: http://localhost:9090)
 *   - MCP_PROXY_TOKEN  — proxy auth token (required for MCP calls)
 *
 * CLI flags:
 *   --acp              — start in ACP agent mode
 *   --port <number>    — ACP server port (default: 3002)
 */

import { createInterface } from "node:readline";
import { createMcpClient } from "./mcp-client.js";
import { startAcpServer } from "./acp-server.js";
import { executeCommand, type ToolCaller, type ToolDefinition } from "./tool-caller.js";

// ── CLI Argument Parsing ──────────────────────────────────────────────

interface CliArgs {
  acpMode: boolean;
  port: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    acpMode: false,
    port: 3002,
  };

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--acp") {
      args.acpMode = true;
    } else if (argv[i] === "--port" && i + 1 < argv.length) {
      const port = parseInt(argv[i + 1], 10);
      if (!isNaN(port) && port > 0) {
        args.port = port;
      }
      i++;
    }
  }

  return args;
}

// ── REPL Mode ─────────────────────────────────────────────────────────

async function runRepl(caller: ToolCaller): Promise<void> {
  // Pre-fetch tools for help messages
  let cachedTools: ToolDefinition[] = [];
  try {
    cachedTools = await caller.listTools();
    console.log(`[mcp-agent] ${cachedTools.length} tool(s) available. Type "help" for commands.`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[mcp-agent] WARNING: Could not list tools: ${msg}`);
  }

  console.log('[mcp-agent] Type "list" for available tools, "<tool> <json>" to call, "exit" to quit.');
  console.log("");

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "> ",
  });

  rl.prompt();

  rl.on("line", async (line: string) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    const result = await executeCommand(input, caller, cachedTools);
    console.log(result.output);

    if (result.exit) {
      rl.close();
      return;
    }

    // Refresh cached tools after list command
    if (input === "list") {
      try {
        cachedTools = await caller.listTools();
      } catch {
        // Keep existing cache
      }
    }

    rl.prompt();
  });

  rl.on("close", () => {
    process.exit(0);
  });
}

// ── Main ──────────────────────────────────────────────────────────────

export async function main(argv?: string[]): Promise<void> {
  const cliArgs = parseArgs(argv ?? process.argv.slice(2));

  // 1. Verify TEST_TOKEN was received
  const testToken = process.env.TEST_TOKEN;
  if (!testToken) {
    console.error("[mcp-agent] ERROR: TEST_TOKEN not found in environment.");
    console.error("[mcp-agent] The credential pipeline did not inject TEST_TOKEN.");
    process.exit(1);
  }
  console.log("[mcp-agent] Connected. TEST_TOKEN received.");

  // 2. Read proxy config and create MCP client
  const proxyUrl = process.env.MCP_PROXY_URL ?? "http://localhost:9090";
  const proxyToken = process.env.MCP_PROXY_TOKEN;

  let caller: ToolCaller | null = null;

  if (proxyToken) {
    try {
      caller = await createMcpClient({ proxyUrl, proxyToken });
      console.log("[mcp-agent] MCP session established.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[mcp-agent] WARNING: Could not establish MCP session: ${msg}`);
      console.error("[mcp-agent] Tool listing and calling will not work.");
    }
  } else {
    console.log("[mcp-agent] MCP_PROXY_TOKEN not set. Running in credential-only mode.");
  }

  if (!caller) {
    // Create a no-op caller for credential-only mode
    caller = {
      async listTools() {
        return [];
      },
      async callTool() {
        throw new Error("No MCP session available. Cannot call tools.");
      },
    };
  }

  // 3. Run in the selected mode
  if (cliArgs.acpMode) {
    console.log(`[mcp-agent] Starting ACP server on port ${cliArgs.port}...`);
    const server = await startAcpServer({ port: cliArgs.port, caller });

    // Handle graceful shutdown
    const shutdown = async () => {
      console.log("\n[mcp-agent] Shutting down ACP server...");
      await server.close();
      process.exit(0);
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  } else {
    await runRepl(caller);
  }
}

// ── Run if executed directly ──────────────────────────────────────────

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("mcp-agent.js") || process.argv[1].endsWith("index.js"));

if (isMain) {
  main().catch((err) => {
    console.error("[mcp-agent] Fatal:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
