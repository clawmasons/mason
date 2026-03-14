/**
 * Lightweight MCP client for calling tools via Streamable HTTP transport.
 *
 * This avoids importing the full @modelcontextprotocol/sdk package,
 * keeping the esbuild bundle small.
 *
 * Supports both JSON and SSE (text/event-stream) responses from the proxy.
 */

let requestIdCounter = 1;

const MCP_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};

export interface McpToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

/**
 * Parse an MCP response which may be JSON or SSE (text/event-stream).
 * SSE responses contain JSON-RPC messages in `data:` lines.
 */
async function parseMcpResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("text/event-stream")) {
    // Parse SSE to extract JSON-RPC response
    const text = await response.text();
    const lines = text.split("\n");
    let lastData = "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        lastData = line.slice(6);
      }
    }

    if (!lastData) {
      throw new Error("SSE response contained no data events");
    }

    return JSON.parse(lastData);
  }

  // Standard JSON response
  return response.json();
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
      ...MCP_HEADERS,
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

  // Consume the response body (may be JSON or SSE)
  await parseMcpResponse(initResponse);

  const mcpSessionId = initResponse.headers.get("mcp-session-id");
  if (!mcpSessionId) {
    throw new Error("MCP initialize response missing mcp-session-id header");
  }

  // Send initialized notification (no response expected for notifications)
  await fetch(`${proxyUrl}/mcp`, {
    method: "POST",
    headers: {
      ...MCP_HEADERS,
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
 * Handles both JSON and SSE response formats.
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
      ...MCP_HEADERS,
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

  const body = (await parseMcpResponse(response)) as {
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
