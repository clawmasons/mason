/**
 * Lightweight MCP client for the mcp-agent.
 *
 * Provides session initialization, tool listing, and tool calling
 * via the MCP streamable-http protocol over the chapter proxy.
 */

import type { ToolCaller, ToolDefinition, ToolCallResult } from "./tool-caller.js";

// ── Types ─────────────────────────────────────────────────────────────

export interface McpClientConfig {
  proxyUrl: string;
  proxyToken: string;
}

// ── Helpers ───────────────────────────────────────────────────────────

let requestIdCounter = 1;

const MCP_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};

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

// ── Implementation ────────────────────────────────────────────────────

async function initializeMcpSession(
  proxyUrl: string,
  proxyToken: string,
): Promise<string> {
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
        clientInfo: { name: "mcp-agent", version: "1.0.0" },
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

  // Send initialized notification
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

  return mcpSessionId;
}

async function mcpListTools(
  proxyUrl: string,
  proxyToken: string,
  mcpSessionId: string,
): Promise<ToolDefinition[]> {
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
      method: "tools/list",
      params: {},
    }),
  });

  if (!response.ok) {
    throw new Error(`MCP tools/list failed: ${response.status} ${response.statusText}`);
  }

  const body = (await parseMcpResponse(response)) as {
    result?: { tools: ToolDefinition[] };
    error?: { message: string };
  };

  if (body.error) {
    throw new Error(`MCP tools/list error: ${body.error.message}`);
  }

  return body.result?.tools ?? [];
}

async function mcpCallTool(
  proxyUrl: string,
  proxyToken: string,
  mcpSessionId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
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
      params: { name: toolName, arguments: args },
    }),
  });

  if (!response.ok) {
    throw new Error(`MCP tool call failed: ${response.status} ${response.statusText}`);
  }

  const body = (await parseMcpResponse(response)) as {
    result?: ToolCallResult;
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

// ── Public API ────────────────────────────────────────────────────────

/**
 * Create a ToolCaller backed by the MCP streamable-http protocol.
 *
 * Initializes an MCP session with the proxy and returns a ToolCaller
 * interface for listing and calling tools.
 */
export async function createMcpClient(config: McpClientConfig): Promise<ToolCaller> {
  const { proxyUrl, proxyToken } = config;
  const mcpSessionId = await initializeMcpSession(proxyUrl, proxyToken);

  return {
    async listTools(): Promise<ToolDefinition[]> {
      return mcpListTools(proxyUrl, proxyToken, mcpSessionId);
    },

    async callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
      return mcpCallTool(proxyUrl, proxyToken, mcpSessionId, name, args);
    },
  };
}
