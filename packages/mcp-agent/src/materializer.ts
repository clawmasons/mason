import type { ResolvedAgent } from "@clawmasons/shared";
import type { RuntimeMaterializer, MaterializationResult, MaterializeOptions, AgentPackage } from "@clawmasons/agent-sdk";
import {
  generateAgentsMd,
  generateAgentLaunchJson,
} from "@clawmasons/agent-sdk";

/**
 * Generate .mcp.json content for the mcp-agent.
 *
 * Creates a single "chapter" MCP server entry pointing at the proxy's
 * unified endpoint:  /sse  (SSE)  or  /mcp  (streamable-http).
 */
function generateMcpJson(
  proxyEndpoint: string,
  proxyType: "sse" | "streamable-http",
  proxyToken?: string,
): string {
  const pathSuffix = proxyType === "sse" ? "/sse" : "/mcp";
  const bearerValue = proxyToken
    ? `Bearer ${proxyToken}`
    : "Bearer ${MCP_PROXY_TOKEN}";

  const mcpConfig = {
    mcpServers: {
      chapter: {
        type: proxyType,
        url: `${proxyEndpoint}${pathSuffix}`,
        headers: {
          Authorization: bearerValue,
        },
      },
    },
  };

  return JSON.stringify(mcpConfig, null, 2);
}

/** Reference to the parent AgentPackage — set after construction. */
let _agentPkg: AgentPackage;

/**
 * MCP Agent runtime materializer.
 *
 * Generates a minimal workspace directory for the mcp-agent package:
 * - .mcp.json — MCP server config pointing to chapter-proxy
 * - AGENTS.md — agent identity and role documentation
 *
 * The mcp-agent is a tool-calling REPL/ACP agent, not a full coding
 * agent, so it does not need slash commands, IDE settings, or extensions.
 */
export const mcpAgentMaterializer: RuntimeMaterializer = {
  name: "mcp-agent",

  materializeWorkspace(
    agent: ResolvedAgent,
    proxyEndpoint: string,
    proxyToken?: string,
    options?: MaterializeOptions,
  ): MaterializationResult {
    const result: MaterializationResult = new Map();
    const proxyType = agent.proxy?.type ?? "sse";

    // .mcp.json — MCP server config at workspace root
    result.set(
      ".mcp.json",
      generateMcpJson(proxyEndpoint, proxyType, proxyToken),
    );

    // AGENTS.md — agent identity and role documentation
    result.set("AGENTS.md", generateAgentsMd(agent));

    // agent-launch.json — tells agent-entry how to bootstrap this agent
    result.set(
      "agent-launch.json",
      generateAgentLaunchJson(_agentPkg, agent.credentials, options?.acpMode),
    );

    return result;
  },
};

/**
 * Set the parent AgentPackage reference (called during package initialization).
 * @internal
 */
export function _setAgentPackage(pkg: AgentPackage): void {
  _agentPkg = pkg;
}
