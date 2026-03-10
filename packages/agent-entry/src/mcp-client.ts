/**
 * Lightweight MCP client for calling tools via Streamable HTTP transport.
 *
 * This avoids importing the full @modelcontextprotocol/sdk package,
 * keeping the esbuild bundle small.
 */

let requestIdCounter = 1;

export interface McpToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

/**
 * Initialize an MCP session with the proxy and return the session info.
 * Sends an `initialize` JSON-RPC request to establish the MCP session,
 * then sends `initialized` notification.
 */
export async function initializeMcpSession(
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
        clientInfo: {
          name: "agent-entry",
          version: "0.1.0",
        },
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

  // Send initialized notification (no response expected for notifications)
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

/**
 * Call an MCP tool on the proxy using Streamable HTTP transport.
 *
 * Sends a JSON-RPC `tools/call` request and parses the response.
 */
export async function callTool(
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
      params: {
        name: toolName,
        arguments: args,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`MCP tool call failed: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as {
    jsonrpc: string;
    id: number;
    result?: McpToolResult;
    error?: { code: number; message: string };
  };

  if (body.error) {
    throw new Error(`MCP tool error: ${body.error.message}`);
  }

  if (!body.result) {
    throw new Error("MCP tool call returned no result");
  }

  return body.result;
}
