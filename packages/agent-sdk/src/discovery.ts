import * as fs from "node:fs";
import * as path from "node:path";
import type { AgentPackage } from "./types.js";

/**
 * Agent registry mapping agent type names (and aliases) to AgentPackage instances.
 */
export type AgentRegistry = Map<string, AgentPackage>;

/**
 * Per-agent launch profile declared in .mason/config.json.
 */
export interface AgentEntryConfig {
  /** npm package name implementing the agent SDK */
  package: string;
  /** Host path to bind-mount over /home/mason/ in the agent container */
  home?: string;
  /** Default startup mode (overridable by CLI flags) */
  mode?: "terminal" | "acp" | "bash";
  /** Default role name to use when --role is not supplied */
  role?: string;
}

/**
 * Config file schema for .mason/config.json.
 */
interface MasonConfig {
  agents?: Record<string, unknown>;
}

const VALID_MODES = new Set<string>(["terminal", "acp", "bash"]);

/**
 * Parse and validate a raw config entry. Returns null if the entry is invalid (missing package).
 * Warns and normalises invalid mode values.
 */
function parseEntryConfig(name: string, raw: unknown): AgentEntryConfig | null {
  if (!raw || typeof raw !== "object") {
    console.warn(`[agent-sdk] Invalid agent config for "${name}": missing "package" field`);
    return null;
  }
  const obj = raw as Record<string, unknown>;

  if (typeof obj.package !== "string") {
    console.warn(`[agent-sdk] Invalid agent config for "${name}": missing "package" field`);
    return null;
  }

  const entry: AgentEntryConfig = { package: obj.package };

  if (obj.home !== undefined && typeof obj.home === "string") {
    entry.home = obj.home;
  }

  if (obj.mode !== undefined) {
    if (typeof obj.mode === "string" && VALID_MODES.has(obj.mode)) {
      entry.mode = obj.mode as "terminal" | "acp" | "bash";
    } else {
      console.warn(
        `[agent-sdk] Agent "${name}" has invalid mode "${String(obj.mode)}" (expected terminal, acp, or bash). Defaulting to terminal.`,
      );
      entry.mode = "terminal";
    }
  }

  if (obj.role !== undefined && typeof obj.role === "string") {
    entry.role = obj.role;
  }

  return entry;
}

/**
 * Read and parse .mason/config.json from the given project directory.
 * Returns null if the file does not exist or cannot be parsed.
 */
function readMasonConfig(projectDir: string): MasonConfig | null {
  const configPath = path.join(projectDir, ".mason", "config.json");
  if (!fs.existsSync(configPath)) return null;

  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(raw) as MasonConfig;
  } catch {
    console.warn(`[agent-sdk] Failed to parse .mason/config.json`);
    return null;
  }
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
  const config = readMasonConfig(projectDir);
  if (!config || !config.agents || typeof config.agents !== "object") {
    return [];
  }

  const agents: AgentPackage[] = [];

  for (const [name, raw] of Object.entries(config.agents)) {
    const entry = parseEntryConfig(name, raw);
    if (!entry) continue;

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
 * Return the raw (validated) config entry for a named agent from .mason/config.json.
 * Synchronous — no dynamic imports. Safe to call before the async registry is initialised.
 *
 * @returns The AgentEntryConfig, or undefined if the file is absent or the agent is not declared.
 */
export function loadConfigAgentEntry(projectDir: string, agentName: string): AgentEntryConfig | undefined {
  const config = readMasonConfig(projectDir);
  if (!config?.agents) return undefined;

  const raw = config.agents[agentName];
  if (raw === undefined) return undefined;

  const entry = parseEntryConfig(agentName, raw);
  return entry ?? undefined;
}

/**
 * Return all agent key names declared in .mason/config.json.
 * Synchronous — no dynamic imports. Safe to call before program.parse().
 *
 * @returns Array of agent key names, or empty array if the file is absent or unparseable.
 */
export function readConfigAgentNames(projectDir: string): string[] {
  const config = readMasonConfig(projectDir);
  if (!config?.agents || typeof config.agents !== "object") return [];
  return Object.keys(config.agents);
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
