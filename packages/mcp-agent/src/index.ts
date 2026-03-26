/**
 * MCP Agent — General-purpose MCP agent with REPL mode.
 *
 * Environment variables:
 *   - TEST_TOKEN       — credential injected by agent-entry (required)
 *   - MCP_PROXY_URL    — proxy URL (default: http://localhost:9090)
 *   - MCP_PROXY_TOKEN  — proxy auth token (required for MCP calls)
 */

import { createInterface } from "node:readline";
import { createMcpClient } from "./mcp-client.js";
import { executeCommand, type ToolCaller, type ToolDefinition } from "./tool-caller.js";

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

export async function main(): Promise<void> {
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

  // 3. Resolve credentials and verify
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
  console.error("[mcp-agent] Connected. TEST_TOKEN received.");

  // 4. Connect to proxy and start REPL
  let caller: ToolCaller | null = null;

  if (!proxyToken) {
    console.error("[mcp-agent] MCP_PROXY_TOKEN not set. Running in credential-only mode.");
  } else {
    const maxRetries = 15;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        caller = await createMcpClient({ proxyUrl, proxyToken });
        console.error("[mcp-agent] MCP session established.");
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt < maxRetries) {
          console.error(`[mcp-agent] Proxy not ready (attempt ${attempt}/${maxRetries}): ${msg}`);
          await new Promise((r) => setTimeout(r, 2000));
        } else {
          console.error(`[mcp-agent] WARNING: Could not establish MCP session after ${maxRetries} attempts: ${msg}`);
          console.error("[mcp-agent] Tool listing and calling will not work.");
        }
      }
    }
  }

  if (!caller) {
    caller = {
      async listTools() { return []; },
      async callTool() { throw new Error("No MCP session available. Cannot call tools."); },
    };
  }

  await runRepl(caller);
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
