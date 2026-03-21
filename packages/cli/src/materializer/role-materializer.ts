/**
 * Role-based materializer orchestration.
 *
 * Provides `materializeForAgent()` — the primary entry point for the
 * ROLE_TYPES pipeline to invoke materializers. Uses the agent discovery
 * registry to look up AgentPackage instances dynamically.
 */

import * as path from "node:path";
import type { Role, ResolvedAgent } from "@clawmasons/shared";
import { adaptRoleToResolvedAgent } from "@clawmasons/shared";
import type { RuntimeMaterializer, MaterializationResult, MaterializeOptions, AgentPackage, AgentRegistry, AgentTaskConfig } from "@clawmasons/agent-sdk";
import { createAgentRegistry, getAgent, getRegisteredAgentNames, readTasks } from "@clawmasons/agent-sdk";

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
// Task Content Resolution
// ---------------------------------------------------------------------------

/** Canonical mason task config for roles stored in .mason/tasks/. */
const MASON_TASK_CONFIG: AgentTaskConfig = {
  projectFolder: ".mason/tasks",
  nameFormat: "{scopeKebab}-{taskName}.md",
  scopeFormat: "kebab-case-prefix",
  supportedFields: "all",
  prompt: "markdown-body",
};

/**
 * Determine the AgentTaskConfig for reading tasks from the role's source location.
 */
function getSourceTaskConfig(role: Role): AgentTaskConfig | undefined {
  const dialect = role.source.agentDialect;
  if (!dialect || dialect === "mason") return MASON_TASK_CONFIG;

  const agentPkg = getAgentFromRegistry(dialect);
  return agentPkg?.tasks ?? MASON_TASK_CONFIG;
}

/**
 * Determine the project directory for reading source task files.
 *
 * For local roles: role.source.path is the role dir (e.g., <project>/.mason/roles/<name>),
 * so the project root is 3 levels up.
 * For packaged roles: source.path is the package directory itself.
 */
function getSourceProjectDir(role: Role): string | undefined {
  if (role.source.type === "package" && role.source.path) {
    return role.source.path;
  }

  if (role.source.type === "local" && role.source.path) {
    return path.resolve(role.source.path, "..", "..", "..");
  }

  return undefined;
}

/**
 * Read actual task file contents from the role's source location and
 * populate prompt + metadata fields on the ResolvedAgent's tasks.
 *
 * This bridges the gap between TaskRef (name-only references in the Role)
 * and the full ResolvedTask with prompt content that materializers need.
 */
export function resolveTaskContent(agent: ResolvedAgent, role: Role): void {
  const sourceConfig = getSourceTaskConfig(role);
  const sourceProjectDir = getSourceProjectDir(role);

  if (!sourceConfig || !sourceProjectDir) return;

  const sourceTasks = readTasks(sourceConfig, sourceProjectDir);

  // Build lookup by task name
  const sourceByName = new Map(sourceTasks.map((t) => [t.name, t]));

  for (const resolvedRole of agent.roles) {
    for (const task of resolvedRole.tasks) {
      const source = sourceByName.get(task.name);
      if (source) {
        task.prompt = source.prompt;
        if (source.displayName) task.displayName = source.displayName;
        if (source.description) task.description = source.description;
        if (source.category) task.category = source.category;
        if (source.tags) task.tags = source.tags;
        if (source.scope) task.scope = source.scope;
      }
    }
  }
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

  // Resolve actual task prompt content from source files.
  resolveTaskContent(resolvedAgent, role);

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
