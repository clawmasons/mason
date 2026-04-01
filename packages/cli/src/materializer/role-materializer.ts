/**
 * Role-based materializer orchestration.
 *
 * Provides `materializeForAgent()` — the primary entry point for the
 * ROLE_TYPES pipeline to invoke materializers. Uses the agent discovery
 * registry to look up AgentPackage instances dynamically.
 */

import * as path from "node:path";
import type { Role, ResolvedAgent } from "@clawmasons/shared";
import { adaptRoleToResolvedAgent, getDialect, getDialectByDirectory, registerAgentDialect } from "@clawmasons/shared";
import type { RuntimeMaterializer, MaterializationResult, MaterializeOptions, AgentPackage, AgentRegistry, AgentTaskConfig, AgentSkillConfig } from "@clawmasons/agent-sdk";
import { createAgentRegistry, getAgent, getRegisteredAgentNames, readTask, readSkills, resolveAgentWithAutoInstall } from "@clawmasons/agent-sdk";

// Built-in agent packages — only mcp-agent is bundled; others are auto-installed.
import { default as mcpAgent } from "@clawmasons/mcp-agent/agent-package";

/** Built-in agent packages list. */
export const BUILTIN_AGENTS: AgentPackage[] = [mcpAgent];

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
let _projectDir: string | undefined;
let _cliVersion: string | undefined;

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
      // Dynamic dialect self-registration
      if (agent.dialect) {
        registerAgentDialect({
          name: agent.name,
          dialect: agent.dialect,
          dialectFields: agent.dialectFields,
          tasks: agent.tasks,
          skills: agent.skills,
        });
      }
    }
  }
  return _registry;
}

/**
 * Register dialect information for a newly-installed agent so that
 * dialect lookups work without restarting the process.
 */
function registerAgentDialects(agents: Iterable<AgentPackage>): void {
  const seen = new Set<string>();
  for (const agent of agents) {
    if (agent.dialect && !seen.has(agent.name)) {
      seen.add(agent.name);
      registerAgentDialect({
        name: agent.name,
        dialect: agent.dialect,
        dialectFields: agent.dialectFields,
        tasks: agent.tasks,
        skills: agent.skills,
      });
    }
  }
}

/**
 * Initialize the registry with config-declared agents from a project directory.
 * Call this at CLI startup before any materialization.
 */
export async function initRegistry(projectDir?: string, cliVersion?: string): Promise<void> {
  _projectDir = projectDir;
  _cliVersion = cliVersion;
  _registry = await createAgentRegistry(BUILTIN_AGENTS, projectDir);

  // Dynamic dialect self-registration from agent packages.
  // Deduplicate: registry may have aliases pointing to the same agent.
  registerAgentDialects(_registry.values());
}

/**
 * Register additional agent packages into the registry at runtime.
 *
 * Primarily intended for tests and dynamic agent loading scenarios
 * where agents are not part of the built-in set but need to be
 * available via the registry.
 */
export function registerAgents(agents: AgentPackage[]): void {
  const registry = getRegistry();
  for (const agent of agents) {
    registry.set(agent.name, agent);
    if (agent.aliases) {
      for (const alias of agent.aliases) {
        registry.set(alias, agent);
      }
    }
  }
  registerAgentDialects(agents);
}

/**
 * Look up an AgentPackage by agent type name or alias.
 */
export function getAgentFromRegistry(agentType: string): AgentPackage | undefined {
  return getAgent(getRegistry(), agentType);
}

/**
 * Look up an AgentPackage by name, falling back to auto-install if not found.
 *
 * When the agent is not in the registry and a project directory + CLI version
 * are available (set during `initRegistry`), this attempts to resolve the
 * agent name to an npm package, install it into `.mason/node_modules/`,
 * re-discover installed agents, and return the newly available package.
 *
 * @returns The AgentPackage, or undefined if resolution and auto-install both fail.
 */
export async function getAgentFromRegistryWithAutoInstall(agentType: string): Promise<AgentPackage | undefined> {
  const existing = getAgent(getRegistry(), agentType);
  if (existing) return existing;

  // Attempt auto-install if we have the necessary context
  if (_projectDir && _cliVersion) {
    const installed = await resolveAgentWithAutoInstall(_projectDir, agentType, _cliVersion, getRegistry());
    if (installed) {
      // Register dialects for the newly discovered agent
      registerAgentDialects([installed]);
      return installed;
    }
  }

  return undefined;
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

/**
 * Get all registered names in the agent registry (both canonical names and aliases).
 *
 * @returns Array of all keys in the registry map
 */
export function getAllRegisteredNames(): string[] {
  return [...getRegistry().keys()];
}

// ---------------------------------------------------------------------------
// Source Dialect Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a sources entry (e.g. ".claude", "claude") to an AgentPackage.
 * Strips leading dot, looks up dialect by directory, then gets the agent package.
 */
function resolveSourceDialect(source: string): AgentPackage | undefined {
  // Try exact dialect registry key first (e.g., "claude-code-agent")
  const exactDialect = getDialect(source);
  if (exactDialect) {
    return getAgentFromRegistry(exactDialect.name);
  }
  // Fall back to directory-based lookup (e.g., ".claude" or "claude")
  const dir = source.startsWith(".") ? source.slice(1) : source;
  const dialect = getDialectByDirectory(dir);
  if (!dialect) return undefined;
  return getAgentFromRegistry(dialect.name);
}

// ---------------------------------------------------------------------------
// Task Content Resolution
// ---------------------------------------------------------------------------

/** Canonical mason task config for roles stored in .mason/tasks/. */
const MASON_TASK_CONFIG: AgentTaskConfig = {
  projectFolder: ".mason/tasks",
  nameFormat: "{scopePath}/{taskName}.md",
  scopeFormat: "path",
  supportedFields: "all",
  prompt: "markdown-body",
};

/**
 * Determine the AgentTaskConfig for reading tasks from the role's source location.
 */
function getSourceTaskConfig(role: Role): AgentTaskConfig | undefined {
  // Check explicit sources first
  if (role.sources?.length) {
    for (const src of role.sources) {
      const pkg = resolveSourceDialect(src);
      if (pkg?.tasks) return pkg.tasks;
    }
  }
  // Fall back to auto-detected dialect
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

  for (const resolvedRole of agent.roles) {
    for (const task of resolvedRole.tasks) {
      const source = readTask(sourceConfig, sourceProjectDir, task.name, task.scope ?? "");
      if (source) {
        task.prompt = source.prompt;
        if (source.displayName) task.displayName = source.displayName;
        if (source.description) task.description = source.description;
        if (source.category) task.category = source.category;
        if (source.tags) task.tags = source.tags;
        if (source.scope) task.scope = source.scope;
      } else {
        console.warn(`  Warning: task "${task.name}" not found in source (searched ${sourceConfig.projectFolder})`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Skill Content Resolution
// ---------------------------------------------------------------------------

/** Canonical mason skill config for roles stored in .mason/skills/. */
const MASON_SKILL_CONFIG: AgentSkillConfig = {
  projectFolder: ".mason/skills",
};

/**
 * Determine the AgentSkillConfig for reading skills from the role's source location.
 */
function getSourceSkillConfig(role: Role): AgentSkillConfig | undefined {
  // Check explicit sources first
  if (role.sources?.length) {
    for (const src of role.sources) {
      const pkg = resolveSourceDialect(src);
      if (pkg?.skills) return pkg.skills;
    }
  }
  // Fall back to auto-detected dialect
  const dialect = role.source.agentDialect;
  if (!dialect || dialect === "mason") return MASON_SKILL_CONFIG;

  const agentPkg = getAgentFromRegistry(dialect);
  return agentPkg?.skills ?? MASON_SKILL_CONFIG;
}

/**
 * Read actual skill file contents from the role's source location and
 * populate contentMap on the ResolvedAgent's skills.
 *
 * This bridges the gap between SkillRef (name-only references in the Role)
 * and the full ResolvedSkill with file content that materializers need.
 */
export function resolveSkillContent(agent: ResolvedAgent, role: Role): void {
  const sourceConfig = getSourceSkillConfig(role);
  const sourceProjectDir = getSourceProjectDir(role);

  console.warn(`[DEBUG resolveSkillContent] sourceConfig=${JSON.stringify(sourceConfig)} sourceProjectDir=${sourceProjectDir}`);
  if (!sourceConfig || !sourceProjectDir) { console.warn(`[DEBUG resolveSkillContent] EARLY RETURN (no config or dir)`); return; }

  const sourceSkills = readSkills(sourceConfig, sourceProjectDir);
  console.warn(`[DEBUG resolveSkillContent] sourceSkills=${sourceSkills.map(s => s.name).join(', ')}`);

  // Build lookup by skill name
  const sourceByName = new Map(sourceSkills.map((s) => [s.name, s]));

  for (const resolvedRole of agent.roles) {
    console.warn(`[DEBUG resolveSkillContent] role "${resolvedRole.name}" has ${resolvedRole.skills.length} skills: ${resolvedRole.skills.map(s => s.name).join(', ')}`);
    for (const skill of resolvedRole.skills) {
      const source = sourceByName.get(skill.name);
      if (source) {
        skill.contentMap = source.contentMap;
        if (source.description) skill.description = source.description;
        if (source.artifacts.length > 0) skill.artifacts = source.artifacts;
      } else {
        console.warn(`  Warning: skill "${skill.name}" not found in source (searched ${sourceConfig.projectFolder})`);
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

  // Apply LLM configuration from agent config schema resolution.
  if (options?.llmConfig) {
    resolvedAgent.llm = options.llmConfig;
  }

  // Resolve actual task prompt content from source files.
  resolveTaskContent(resolvedAgent, role);

  // Resolve actual skill file content from source files.
  resolveSkillContent(resolvedAgent, role);

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
