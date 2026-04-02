import type { ToolFilter } from "../toolfilter.js";

/**
 * Shape of the `proxy-config.json` file generated at build time.
 *
 * Contains everything the proxy needs to start without runtime package
 * discovery. Environment variable references are kept as `${VAR_NAME}`
 * placeholders — resolved at proxy startup from the container environment.
 */
export interface ProxyConfigFile {
  /** Role name string. */
  role: string;

  /** Pre-computed per-app tool filter allow-lists. Keyed by app package name. */
  toolFilters: Record<string, ToolFilter>;

  /** Approval patterns from role constraints (requireApprovalFor). */
  approvalPatterns: string[];

  /** MCP server configurations with env vars as unresolved `${VAR_NAME}` placeholders. */
  upstreams: ProxyConfigUpstream[];
}

/**
 * Serializable form of an upstream MCP server configuration.
 * Matches the shape needed to construct `UpstreamMcpConfig` at runtime.
 */
export interface ProxyConfigUpstream {
  /** Full package name, e.g., "@clawmasons/app-github". */
  name: string;

  /** MCP server configuration. */
  server: {
    name: string;
    version: string;
    transport: "stdio" | "sse" | "streamable-http";
    command?: string;
    args?: string[];
    url?: string;
    env?: Record<string, string>;
    tools: string[];
    capabilities: string[];
    credentials: string[];
    location: "proxy" | "host";
    description?: string;
  };
}
