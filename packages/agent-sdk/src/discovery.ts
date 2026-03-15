import * as fs from "node:fs";
import * as path from "node:path";
import type { AgentPackage } from "./types.js";

/**
 * Agent registry mapping agent type names (and aliases) to AgentPackage instances.
 */
export type AgentRegistry = Map<string, AgentPackage>;

/**
 * Config file schema for .mason/config.json agents field.
 */
interface MasonConfig {
  agents?: Record<string, { package: string }>;
}

/**
 * Register an agent package in the registry, including its aliases.
 */
function registerAgent(registry: AgentRegistry, agent: AgentPackage): void {
  registry.set(agent.name, agent);
  if (agent.aliases) {
    for (const alias of agent.aliases) {
      registry.set(alias, agent);
    }
  }
}

/**
 * Validate that a value looks like a valid AgentPackage.
 */
function isValidAgentPackage(value: unknown): value is AgentPackage {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.name === "string" &&
    obj.materializer !== null &&
    typeof obj.materializer === "object" &&
    typeof (obj.materializer as Record<string, unknown>).name === "string" &&
    typeof (obj.materializer as Record<string, unknown>).materializeWorkspace === "function"
  );
}

/**
 * Load third-party agent packages declared in .mason/config.json.
 *
 * @param projectDir - Absolute path to the project root
 * @returns Array of loaded AgentPackage objects (invalid entries are skipped with warnings)
 */
export async function loadConfigAgents(projectDir: string): Promise<AgentPackage[]> {
  const configPath = path.join(projectDir, ".mason", "config.json");

  if (!fs.existsSync(configPath)) {
    return [];
  }

  let config: MasonConfig;
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    config = JSON.parse(raw) as MasonConfig;
  } catch {
    console.warn(`[agent-sdk] Failed to parse .mason/config.json`);
    return [];
  }

  if (!config.agents || typeof config.agents !== "object") {
    return [];
  }

  const agents: AgentPackage[] = [];

  for (const [name, entry] of Object.entries(config.agents)) {
    if (!entry || typeof entry.package !== "string") {
      console.warn(`[agent-sdk] Invalid agent config for "${name}": missing "package" field`);
      continue;
    }

    try {
      const mod = await import(entry.package) as { default?: unknown };
      const agentPkg = mod.default;

      if (!isValidAgentPackage(agentPkg)) {
        console.warn(
          `[agent-sdk] Package "${entry.package}" does not export a valid AgentPackage`,
        );
        continue;
      }

      agents.push(agentPkg);
    } catch {
      console.warn(
        `[agent-sdk] Agent package "${entry.package}" not found. Install it with: npm install ${entry.package}`,
      );
    }
  }

  return agents;
}

/**
 * Create an agent registry from built-in and config-declared agent packages.
 *
 * Built-in agents are registered first. Config-declared agents can override
 * built-in agents by name (explicit user intent).
 *
 * @param builtinAgents - Array of built-in AgentPackage instances
 * @param projectDir - Optional project directory for loading .mason/config.json
 * @returns The populated agent registry
 */
export async function createAgentRegistry(
  builtinAgents: AgentPackage[],
  projectDir?: string,
): Promise<AgentRegistry> {
  const registry: AgentRegistry = new Map();

  // Phase 1: Register built-in agents
  for (const agent of builtinAgents) {
    registerAgent(registry, agent);
  }

  // Phase 2: Load and register config-declared agents (can override built-ins)
  if (projectDir) {
    const configAgents = await loadConfigAgents(projectDir);
    for (const agent of configAgents) {
      registerAgent(registry, agent);
    }
  }

  return registry;
}

/**
 * Get an agent from the registry by name or alias.
 */
export function getAgent(registry: AgentRegistry, name: string): AgentPackage | undefined {
  return registry.get(name);
}

/**
 * Get all unique agent type names (excluding aliases) from the registry.
 */
export function getRegisteredAgentNames(registry: AgentRegistry): string[] {
  const names = new Set<string>();
  for (const agent of registry.values()) {
    names.add(agent.name);
  }
  return [...names];
}
