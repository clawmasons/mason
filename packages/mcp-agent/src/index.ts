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

// ── Credential Resolution ─────────────────────────────────────────────

/**
 * Connect to the proxy's /connect-agent endpoint to get a session token.
 * The session token is required for credential_request calls.
 */
async function connectAgent(
  proxyUrl: string,
  proxyToken: string,
): Promise<string> {
  const response = await fetch(`${proxyUrl}/connect-agent`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${proxyToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`connect-agent failed: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as { sessionToken: string; sessionId: string };
  return body.sessionToken;
}

/**
 * Resolve credentials via the proxy's credential_request MCP tool.
 * First obtains a session token via /connect-agent, then calls
 * credential_request for each key.
 * Retries proxy connection to handle startup timing.
 */
async function resolveCredentials(
  proxyUrl: string,
  proxyToken: string,
  keys: string[],
): Promise<Record<string, string>> {
  const maxRetries = 15;
  let client: ToolCaller | null = null;
  let sessionToken: string | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (!sessionToken) {
        sessionToken = await connectAgent(proxyUrl, proxyToken);
      }
      client = await createMcpClient({ proxyUrl, proxyToken });
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < maxRetries) {
        console.error(`[mcp-agent] Proxy not ready for credentials (attempt ${attempt}/${maxRetries}): ${msg}`);
        await new Promise((r) => setTimeout(r, 2000));
      } else {
        throw new Error(`Could not connect to proxy after ${maxRetries} attempts: ${msg}`);
      }
    }
  }

  if (!client) throw new Error("Failed to create MCP client for credential resolution");
  if (!sessionToken) throw new Error("Failed to obtain session token for credential resolution");

  const credentials: Record<string, string> = {};
  for (const key of keys) {
    const result = await client.callTool("credential_request", { key, session_token: sessionToken });
    const text = result.content[0]?.text;
    if (!text) throw new Error(`No response for credential: ${key}`);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`Invalid response for credential ${key}: ${text}`);
    }

    if ("error" in parsed) {
      throw new Error(`Credential ${key}: ${parsed.error as string}`);
    }

    if ("value" in parsed && typeof parsed.value === "string") {
      credentials[key] = parsed.value;
    } else {
      throw new Error(`Unexpected response for credential ${key}`);
    }
  }

  return credentials;
}

// ── Main ──────────────────────────────────────────────────────────────

export async function main(argv?: string[]): Promise<void> {
  const cliArgs = parseArgs(argv ?? process.argv.slice(2));

  // 1. Read proxy config
  const proxyUrl = process.env.MCP_PROXY_URL ?? "http://localhost:9090";
  const proxyToken = process.env.MCP_PROXY_TOKEN;

  // 2. Parse declared credential keys
  const declaredCredentials = (process.env.AGENT_CREDENTIALS ?? "").trim();
  let credentialKeys: string[] = [];
  if (declaredCredentials) {
    try {
      credentialKeys = JSON.parse(declaredCredentials) as string[];
    } catch { /* ignore parse errors */ }
  }

  // 3. Resolve credentials and verify (blocking for non-ACP, deferred for ACP)
  async function resolveAndVerifyCredentials(): Promise<void> {
    if (credentialKeys.length > 0 && proxyToken) {
      console.error(`[mcp-agent] Requesting ${credentialKeys.length} credential(s)...`);
      const creds = await resolveCredentials(proxyUrl, proxyToken, credentialKeys);
      for (const [key, value] of Object.entries(creds)) {
        process.env[key] = value;
      }
      console.error("[mcp-agent] All credentials received.");
    }

    const testToken = process.env.TEST_TOKEN;
    if (!testToken) {
      console.error("[mcp-agent] ERROR: TEST_TOKEN not found in environment.");
      console.error("[mcp-agent] The credential pipeline did not inject TEST_TOKEN.");
      process.exit(1);
    }
    console.log("[mcp-agent] Connected. TEST_TOKEN received.");
  }

  let caller: ToolCaller | null = null;

  // connectToProxy retries MCP session establishment
  async function connectToProxy(): Promise<ToolCaller | null> {
    if (!proxyToken) {
      console.log("[mcp-agent] MCP_PROXY_TOKEN not set. Running in credential-only mode.");
      return null;
    }

    const maxRetries = 15;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const c = await createMcpClient({ proxyUrl, proxyToken });
        console.log("[mcp-agent] MCP session established.");
        return c;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt < maxRetries) {
          console.log(`[mcp-agent] Proxy not ready (attempt ${attempt}/${maxRetries}): ${msg}`);
          await new Promise((r) => setTimeout(r, 2000));
        } else {
          console.error(`[mcp-agent] WARNING: Could not establish MCP session after ${maxRetries} attempts: ${msg}`);
          console.error("[mcp-agent] Tool listing and calling will not work.");
        }
      }
    }
    return null;
  }

  // In ACP mode, start the server immediately and resolve credentials + connect to proxy in background
  if (cliArgs.acpMode) {
    // Create a deferred caller that forwards to the real caller once connected
    let realCaller: ToolCaller | null = null;
    const deferredCaller: ToolCaller = {
      async listTools() {
        if (realCaller) return realCaller.listTools();
        return [];
      },
      async callTool(name: string, args: Record<string, unknown>) {
        if (realCaller) return realCaller.callTool(name, args);
        throw new Error("MCP session not yet established. Proxy connection in progress.");
      },
    };

    console.log(`[mcp-agent] Starting ACP server on port ${cliArgs.port}...`);
    const server = await startAcpServer({ port: cliArgs.port, caller: deferredCaller });

    // Resolve credentials and connect to proxy in background
    // Non-fatal in ACP mode: the ACP server must stay running even if
    // credential resolution fails, so the bridge can connect.
    (async () => {
      try {
        await resolveAndVerifyCredentials();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[mcp-agent] Credential resolution failed (non-fatal): ${msg}`);
        console.error("[mcp-agent] ACP server continues without credentials.");
      }
      try {
        const c = await connectToProxy();
        if (c) realCaller = c;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[mcp-agent] Proxy connection failed (non-fatal): ${msg}`);
      }
    })();

    // Handle graceful shutdown
    const shutdown = async () => {
      console.log("\n[mcp-agent] Shutting down ACP server...");
      await server.close();
      process.exit(0);
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  } else {
    // REPL mode: resolve credentials and connect synchronously before starting
    await resolveAndVerifyCredentials();
    caller = await connectToProxy();
    if (!caller) {
      caller = {
        async listTools() { return []; },
        async callTool() { throw new Error("No MCP session available. Cannot call tools."); },
      };
    }
    await runRepl(caller);
  }
}

// ── Run if executed directly ──────────────────────────────────────────

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("mcp-agent.js") ||
   process.argv[1].endsWith("/mcp-agent") ||
   process.argv[1].endsWith("index.js"));

if (isMain) {
  main().catch((err) => {
    console.error("[mcp-agent] Fatal:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
