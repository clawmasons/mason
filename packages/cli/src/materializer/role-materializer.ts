/**
 * Role-based materializer orchestration.
 *
 * Provides `materializeForAgent()` — the primary entry point for the
 * ROLE_TYPES pipeline to invoke materializers. Uses the agent discovery
 * registry to look up AgentPackage instances dynamically.
 */

import type { Role } from "@clawmasons/shared";
import { adaptRoleToResolvedAgent } from "@clawmasons/shared";
import type { RuntimeMaterializer, MaterializationResult, MaterializeOptions, AgentPackage, AgentRegistry } from "@clawmasons/agent-sdk";
import { createAgentRegistry, getAgent, getRegisteredAgentNames } from "@clawmasons/agent-sdk";

// Built-in agent packages
import claudeCodeAgent from "@clawmasons/claude-code-agent";
import piCodingAgent from "@clawmasons/pi-coding-agent";
import { default as mcpAgent } from "@clawmasons/mcp-agent/agent-package";

/** Built-in agent packages list. */
const BUILTIN_AGENTS: AgentPackage[] = [claudeCodeAgent, piCodingAgent, mcpAgent];

/** Default proxy endpoint used when none is provided. */
const DEFAULT_PROXY_ENDPOINT = "http://mcp-proxy:9090";

/**
 * Error thrown when materialization fails due to registry issues.
 */
export class MaterializerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MaterializerError";
  }
}

// ---------------------------------------------------------------------------
// Agent Registry (lazy-initialized)
// ---------------------------------------------------------------------------

let _registry: AgentRegistry | null = null;

/**
 * Get the agent registry, initializing it with built-in agents if needed.
 */
function getRegistry(): AgentRegistry {
  if (!_registry) {
    _registry = new Map();
    for (const agent of BUILTIN_AGENTS) {
      _registry.set(agent.name, agent);
      if (agent.aliases) {
        for (const alias of agent.aliases) {
          _registry.set(alias, agent);
        }
      }
    }
  }
  return _registry;
}

/**
 * Initialize the registry with config-declared agents from a project directory.
 * Call this at CLI startup before any materialization.
 */
export async function initRegistry(projectDir?: string): Promise<void> {
  _registry = await createAgentRegistry(BUILTIN_AGENTS, projectDir);
}

/**
 * Look up an AgentPackage by agent type name or alias.
 */
export function getAgentFromRegistry(agentType: string): AgentPackage | undefined {
  return getAgent(getRegistry(), agentType);
}

/**
 * Look up a materializer by agent type.
 *
 * @param agentType - The agent type string (e.g., "claude-code-agent", "mcp-agent")
 * @returns The RuntimeMaterializer for that type, or undefined if not registered
 */
export function getMaterializer(agentType: string): RuntimeMaterializer | undefined {
  const agent = getAgent(getRegistry(), agentType);
  return agent?.materializer;
}

/**
 * Get all registered agent types (excluding aliases).
 *
 * @returns Array of agent type strings that have materializers registered
 */
export function getRegisteredAgentTypes(): string[] {
  return getRegisteredAgentNames(getRegistry());
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Materialize a Role for a specific agent runtime.
 *
 * This is the primary entry point for the ROLE_TYPES pipeline. It:
 * 1. Looks up the materializer for the given agent type
 * 2. Converts the Role to a ResolvedAgent via the adapter
 * 3. Invokes the materializer's existing workspace generation logic
 *
 * @param role - A validated Role from the ROLE_TYPES pipeline
 * @param agentType - The target agent type (e.g., "claude-code-agent", "pi-coding-agent", "mcp-agent")
 * @param proxyEndpoint - The MCP proxy endpoint URL (defaults to "http://mcp-proxy:9090")
 * @param proxyToken - Optional proxy authentication token
 * @param options - Optional materialization options (e.g., ACP mode)
 * @returns A MaterializationResult (Map of relative paths to file content)
 * @throws MaterializerError if no materializer is registered for the agent type
 * @throws AdapterError (from @clawmasons/shared) if the agent type is not a known dialect
 */
export function materializeForAgent(
  role: Role,
  agentType: string,
  proxyEndpoint?: string,
  proxyToken?: string,
  options?: MaterializeOptions,
  existingHomePath?: string,
): MaterializationResult {
  const materializer = getMaterializer(agentType);
  if (!materializer) {
    const knownTypes = getRegisteredAgentTypes().join(", ");
    throw new MaterializerError(
      `No materializer registered for agent type "${agentType}". ` +
      `Registered types: ${knownTypes}`,
    );
  }

  // Convert Role to ResolvedAgent via the adapter.
  const resolvedAgent = adaptRoleToResolvedAgent(role, agentType);

  // Merge agent-config credentials (from .mason/config.json) into the resolved agent.
  if (options?.agentConfigCredentials?.length) {
    for (const key of options.agentConfigCredentials) {
      if (!resolvedAgent.credentials.includes(key)) {
        resolvedAgent.credentials.push(key);
      }
    }
  }

  const endpoint = proxyEndpoint ?? DEFAULT_PROXY_ENDPOINT;

  return materializer.materializeWorkspace(
    resolvedAgent,
    endpoint,
    proxyToken,
    options,
    existingHomePath,
  );
}
