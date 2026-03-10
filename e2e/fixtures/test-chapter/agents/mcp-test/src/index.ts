/**
 * MCP Test Agent — Interactive REPL for testing the credential and MCP tool pipeline.
 *
 * On boot, verifies TEST_TOKEN was received via the credential pipeline.
 * Then enters a REPL loop:
 *   - "list"                    → lists available MCP tools
 *   - "<tool_name> <json_args>" → calls the named tool with the given args
 *   - "exit"                    → exits the agent
 *
 * Environment variables:
 *   - TEST_TOKEN       — credential injected by agent-entry (required)
 *   - MCP_PROXY_URL    — proxy URL (default: http://localhost:9090)
 *   - MCP_PROXY_TOKEN  — proxy auth token (required for MCP calls)
 */

import { createInterface } from "node:readline";

// ── Types ─────────────────────────────────────────────────────────────

interface McpToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

interface McpToolDefinition {
  name: string;
  description?: string;
}

// ── Lightweight MCP Client ────────────────────────────────────────────

let requestIdCounter = 1;

async function initializeMcpSession(
  proxyUrl: string,
  proxyToken: string,
): Promise<{ sessionId: string }> {
  const initResponse = await fetch(`${proxyUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${proxyToken}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: requestIdCounter++,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "mcp-test", version: "1.0.0" },
      },
    }),
  });

  if (!initResponse.ok) {
    throw new Error(`MCP initialize failed: ${initResponse.status} ${initResponse.statusText}`);
  }

  const mcpSessionId = initResponse.headers.get("mcp-session-id");
  if (!mcpSessionId) {
    throw new Error("MCP initialize response missing mcp-session-id header");
  }

  // Send initialized notification
  await fetch(`${proxyUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${proxyToken}`,
      "mcp-session-id": mcpSessionId,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    }),
  });

  return { sessionId: mcpSessionId };
}

async function listTools(
  proxyUrl: string,
  proxyToken: string,
  mcpSessionId: string,
): Promise<McpToolDefinition[]> {
  const id = requestIdCounter++;

  const response = await fetch(`${proxyUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${proxyToken}`,
      "mcp-session-id": mcpSessionId,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "tools/list",
      params: {},
    }),
  });

  if (!response.ok) {
    throw new Error(`MCP tools/list failed: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as {
    result?: { tools: McpToolDefinition[] };
    error?: { message: string };
  };

  if (body.error) {
    throw new Error(`MCP tools/list error: ${body.error.message}`);
  }

  return body.result?.tools ?? [];
}

async function callTool(
  proxyUrl: string,
  proxyToken: string,
  mcpSessionId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<McpToolResult> {
  const id = requestIdCounter++;

  const response = await fetch(`${proxyUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${proxyToken}`,
      "mcp-session-id": mcpSessionId,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
  });

  if (!response.ok) {
    throw new Error(`MCP tool call failed: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as {
    result?: McpToolResult;
    error?: { message: string };
  };

  if (body.error) {
    throw new Error(`MCP tool error: ${body.error.message}`);
  }

  if (!body.result) {
    throw new Error("MCP tool call returned no result");
  }

  return body.result;
}

// ── Main ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // 1. Verify TEST_TOKEN was received
  const testToken = process.env.TEST_TOKEN;
  if (!testToken) {
    console.error("[mcp-test] ERROR: TEST_TOKEN not found in environment.");
    console.error("[mcp-test] The credential pipeline did not inject TEST_TOKEN.");
    process.exit(1);
  }
  console.log("[mcp-test] Connected. TEST_TOKEN received.");

  // 2. Read proxy config
  const proxyUrl = process.env.MCP_PROXY_URL ?? "http://localhost:9090";
  const proxyToken = process.env.MCP_PROXY_TOKEN;

  let mcpSessionId: string | null = null;

  if (proxyToken) {
    try {
      const session = await initializeMcpSession(proxyUrl, proxyToken);
      mcpSessionId = session.sessionId;
      console.log("[mcp-test] MCP session established.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[mcp-test] WARNING: Could not establish MCP session: ${msg}`);
      console.error("[mcp-test] Tool listing and calling will not work.");
    }
  } else {
    console.log("[mcp-test] MCP_PROXY_TOKEN not set. Running in credential-only mode.");
  }

  console.log('[mcp-test] Type "list" for available tools, "<tool> <json>" to call, "exit" to quit.');
  console.log("");

  // 3. Interactive REPL
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

    if (input === "exit") {
      console.log("[mcp-test] Goodbye.");
      rl.close();
      return;
    }

    if (input === "list") {
      if (!proxyToken || !mcpSessionId) {
        console.log("[mcp-test] Cannot list tools: no MCP session.");
        rl.prompt();
        return;
      }

      try {
        const tools = await listTools(proxyUrl, proxyToken, mcpSessionId);
        if (tools.length === 0) {
          console.log("No tools available.");
        } else {
          console.log("Available tools:");
          for (const tool of tools) {
            const desc = tool.description ? ` — ${tool.description}` : "";
            console.log(`  - ${tool.name}${desc}`);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[mcp-test] Error listing tools: ${msg}`);
      }

      rl.prompt();
      return;
    }

    // Parse "<tool_name> <json_args>"
    const spaceIdx = input.indexOf(" ");
    if (spaceIdx === -1) {
      // Tool name only, no args
      if (!proxyToken || !mcpSessionId) {
        console.log("[mcp-test] Cannot call tools: no MCP session.");
        rl.prompt();
        return;
      }

      try {
        const result = await callTool(proxyUrl, proxyToken, mcpSessionId, input, {});
        printResult(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[mcp-test] Error: ${msg}`);
      }

      rl.prompt();
      return;
    }

    const toolName = input.substring(0, spaceIdx);
    const argsStr = input.substring(spaceIdx + 1).trim();

    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argsStr) as Record<string, unknown>;
    } catch {
      console.error("[mcp-test] Invalid JSON arguments. Usage: <tool_name> {\"key\": \"value\"}");
      rl.prompt();
      return;
    }

    if (!proxyToken || !mcpSessionId) {
      console.log("[mcp-test] Cannot call tools: no MCP session.");
      rl.prompt();
      return;
    }

    try {
      const result = await callTool(proxyUrl, proxyToken, mcpSessionId, toolName, args);
      printResult(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[mcp-test] Error: ${msg}`);
    }

    rl.prompt();
  });

  rl.on("close", () => {
    process.exit(0);
  });
}

function printResult(result: McpToolResult): void {
  if (result.isError) {
    console.log("Error:", result.content.map((c) => c.text).join("\n"));
  } else {
    console.log("Result:", result.content.map((c) => c.text).join("\n"));
  }
}

// Run
main().catch((err) => {
  console.error("[mcp-test] Fatal:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
