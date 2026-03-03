/**
 * A toolFilter entry for a single app in the mcp-proxy config.
 */
export interface ToolFilter {
  mode: "allow";
  list: string[];
}

/**
 * A single mcpServer entry in the proxy config.
 */
export interface McpServerEntry {
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  options: {
    logEnabled: boolean;
    toolFilter: ToolFilter;
  };
}

/**
 * The complete mcp-proxy config.json structure.
 */
export interface ProxyConfig {
  mcpProxy: {
    baseURL: string;
    addr: string;
    name: string;
    version: string;
    type: "sse" | "streamable-http";
    options: {
      panicIfInvalid: boolean;
      logEnabled: boolean;
      authTokens: string[];
    };
  };
  mcpServers: Record<string, McpServerEntry>;
}