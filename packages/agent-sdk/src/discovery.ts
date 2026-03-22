import * as fs from "node:fs";
import * as path from "node:path";
import type { AgentPackage } from "./types.js";

/**
 * Agent registry mapping agent type names (and aliases) to AgentPackage instances.
 */
export type AgentRegistry = Map<string, AgentPackage>;

/**
 * VSCode-specific dev-container customizations (extensions + settings).
 */
export interface DevContainerVscodeCustomizations {
  extensions?: string[];
  settings?: Record<string, unknown>;
}

/**
 * Dev-container customizations to embed into the agent Dockerfile at build time.
 * Follows the dev container spec customizations format.
 */
export interface DevContainerCustomizations {
  vscode?: DevContainerVscodeCustomizations;
}

/**
 * Default dev-container customizations applied when `dev-container-customizations`
 * is absent from the agent config entry.
 */
export const DEFAULT_DEV_CONTAINER_CUSTOMIZATIONS: DevContainerCustomizations = {
  vscode: {
    extensions: [
      "anthropic.claude-code",
      "dbaeumer.vscode-eslint",
      "esbenp.prettier-vscode",
      "yoavbls.pretty-ts-errors",
      "usernamehw.errorlens",
      "editorconfig.editorconfig",
    ],
    settings: {
      "terminal.integrated.defaultProfile.linux": "bash",
    },
  },
};

/**
 * Per-agent registry entry declared in .mason/config.json agents section.
 * Only `package` is the canonical field. Runtime fields are deprecated —
 * move them to an `aliases` entry instead.
 */
export interface AgentEntryConfig {
  /** npm package name implementing the agent SDK */
  package: string;
  /**
   * @deprecated Move to an `aliases` entry. Will be removed in a future version.
   * Host path to bind-mount over /home/mason/ in the agent container.
   */
  home?: string;
  /**
   * @deprecated Move to an `aliases` entry. Will be removed in a future version.
   * Default startup mode (overridable by CLI flags).
   */
  mode?: "terminal" | "acp" | "bash";
  /**
   * @deprecated Move to an `aliases` entry. Will be removed in a future version.
   * Default role name to use when --role is not supplied.
   */
  role?: string;
  /**
   * @deprecated Move to an `aliases` entry. Will be removed in a future version.
   * Dev-container IDE extensions and settings to embed in the agent image at build time.
   */
  devContainerCustomizations?: DevContainerCustomizations;
  /**
   * @deprecated Move to an `aliases` entry. Will be removed in a future version.
   * Additional credential env var keys required by this agent in the current project.
   */
  credentials?: string[];
  /**
   * Per-agent configuration values stored by the config resolution engine.
   * Keyed by group name, then field name (e.g., `{ llm: { provider: "openrouter" } }`).
   */
  config?: Record<string, Record<string, string>>;
}

/**
 * Named runnable preset declared in .mason/config.json aliases section.
 * An alias references an agent from the agents registry and carries all
 * runtime configuration. Run with: mason {aliasName}
 */
export interface AliasEntryConfig {
  /** Key in the agents registry */
  agent: string;
  /** Default startup mode (overridable by CLI flags) */
  mode?: "terminal" | "acp" | "bash";
  /** Default role name to use when --role is not supplied */
  role?: string;
  /** Host path to bind-mount over /home/mason/ in the agent container */
  home?: string;
  /** Dev-container IDE extensions and settings to embed in the agent image at build time */
  devContainerCustomizations?: DevContainerCustomizations;
  /** Additional credential env var keys required by this alias */
  credentials?: string[];
  /** Extra args appended to the agent invocation after all mason-resolved args */
  agentArgs?: string[];
}

/**
 * Config file schema for .mason/config.json.
 */
interface MasonConfig {
  agents?: Record<string, unknown>;
  aliases?: Record<string, unknown>;
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

  // Detect deprecated runtime fields and warn once with all offending keys
  const runtimeFields = ["home", "mode", "role", "credentials", "dev-container-customizations"] as const;
  const foundDeprecated = runtimeFields.filter((f) => obj[f] !== undefined);
  if (foundDeprecated.length > 0) {
    console.warn(
      `[agent-sdk] Agent "${name}" has runtime fields (${foundDeprecated.join(", ")}) in the "agents" config. ` +
      `Move these to an "aliases" entry. Runtime fields in "agents" will be removed in a future version.`,
    );
  }

  if (obj.home !== undefined && typeof obj.home === "string") {
    entry.home = obj.home; // deprecated field — still parsed during deprecation period
  }

  if (obj.mode !== undefined) {
    if (typeof obj.mode === "string" && VALID_MODES.has(obj.mode)) {
      entry.mode = obj.mode as "terminal" | "acp" | "bash"; // deprecated
    } else {
      console.warn(
        `[agent-sdk] Agent "${name}" has invalid mode "${String(obj.mode)}" (expected terminal, acp, or bash). Defaulting to terminal.`,
      );
      entry.mode = "terminal"; // deprecated
    }
  }

  if (obj.role !== undefined && typeof obj.role === "string") {
    entry.role = obj.role; // deprecated
  }

  if (obj["dev-container-customizations"] !== undefined &&
      typeof obj["dev-container-customizations"] === "object" &&
      obj["dev-container-customizations"] !== null) {
    entry.devContainerCustomizations = obj["dev-container-customizations"] as DevContainerCustomizations; // deprecated
  }

  if (obj.credentials !== undefined) {
    if (!Array.isArray(obj.credentials)) {
      console.warn(`[agent-sdk] Agent "${name}" has invalid credentials value (expected array). Ignoring.`);
    } else {
      const validKeys: string[] = [];
      for (const item of obj.credentials) {
        if (typeof item === "string") {
          validKeys.push(item);
        } else {
          console.warn(`[agent-sdk] Agent "${name}" credentials contains non-string entry "${String(item)}". Skipping.`);
        }
      }
      entry.credentials = validKeys; // deprecated
    }
  }

  if (obj.config !== undefined && typeof obj.config === "object" && obj.config !== null) {
    const parsed: Record<string, Record<string, string>> = {};
    for (const [groupKey, groupVal] of Object.entries(obj.config as Record<string, unknown>)) {
      if (typeof groupVal === "object" && groupVal !== null && !Array.isArray(groupVal)) {
        const fields: Record<string, string> = {};
        for (const [fieldKey, fieldVal] of Object.entries(groupVal as Record<string, unknown>)) {
          if (typeof fieldVal === "string") {
            fields[fieldKey] = fieldVal;
          }
        }
        if (Object.keys(fields).length > 0) {
          parsed[groupKey] = fields;
        }
      }
    }
    if (Object.keys(parsed).length > 0) {
      entry.config = parsed;
    }
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
 * Read the raw JSON object from .mason/config.json, returning a plain object.
 * Returns an empty object if the file is absent or unparseable.
 */
function readRawConfig(projectDir: string): Record<string, unknown> {
  const configPath = path.join(projectDir, ".mason", "config.json");
  if (!fs.existsSync(configPath)) return {};

  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Atomically write a JSON object to .mason/config.json.
 * Creates the .mason/ directory if it does not exist.
 * Uses a temp file + rename to prevent partial writes (PRD §10.4).
 */
function writeMasonConfigAtomic(projectDir: string, data: Record<string, unknown>): void {
  const masonDir = path.join(projectDir, ".mason");
  fs.mkdirSync(masonDir, { recursive: true });

  const configPath = path.join(masonDir, "config.json");
  const tmpPath = path.join(masonDir, "config.json.tmp");

  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
  fs.renameSync(tmpPath, configPath);
}

/**
 * Read per-agent configuration from `.mason/config.json`.
 *
 * Returns the `agents.<agentName>.config` object, or an empty object
 * when the file, agent entry, or config field is absent.
 *
 * @param projectDir - Absolute path to the project root
 * @param agentName  - Canonical agent name (e.g., "pi-coding-agent")
 */
export function getAgentConfig(
  projectDir: string,
  agentName: string,
): Record<string, Record<string, string>> {
  const raw = readRawConfig(projectDir);
  const agents = raw.agents;
  if (!agents || typeof agents !== "object" || Array.isArray(agents)) return {};

  const agentEntry = (agents as Record<string, unknown>)[agentName];
  if (!agentEntry || typeof agentEntry !== "object" || Array.isArray(agentEntry)) return {};

  const config = (agentEntry as Record<string, unknown>).config;
  if (!config || typeof config !== "object" || Array.isArray(config)) return {};

  // Validate structure: Record<string, Record<string, string>>
  const result: Record<string, Record<string, string>> = {};
  for (const [groupKey, groupVal] of Object.entries(config as Record<string, unknown>)) {
    if (typeof groupVal === "object" && groupVal !== null && !Array.isArray(groupVal)) {
      const fields: Record<string, string> = {};
      for (const [fieldKey, fieldVal] of Object.entries(groupVal as Record<string, unknown>)) {
        if (typeof fieldVal === "string") {
          fields[fieldKey] = fieldVal;
        }
      }
      if (Object.keys(fields).length > 0) {
        result[groupKey] = fields;
      }
    }
  }
  return result;
}

/**
 * Persist per-agent configuration to `.mason/config.json`.
 *
 * Deep-merges the provided config into `agents.<agentName>.config`,
 * preserving all other fields on the agent entry and all other agent entries.
 * Creates the file, directory, and agent entry if they don't exist.
 *
 * Writes are atomic (temp file + rename) so Ctrl-C never leaves a partial file (PRD §10.4).
 *
 * @param projectDir - Absolute path to the project root
 * @param agentName  - Canonical agent name (e.g., "pi-coding-agent")
 * @param config     - Config values keyed by group, then field (e.g., `{ llm: { provider: "openrouter" } }`)
 */
export function saveAgentConfig(
  projectDir: string,
  agentName: string,
  config: Record<string, Record<string, string>>,
): void {
  const raw = readRawConfig(projectDir);

  // Ensure agents section exists
  if (!raw.agents || typeof raw.agents !== "object" || Array.isArray(raw.agents)) {
    raw.agents = {};
  }
  const agents = raw.agents as Record<string, unknown>;

  // Ensure agent entry exists
  if (!agents[agentName] || typeof agents[agentName] !== "object" || Array.isArray(agents[agentName])) {
    agents[agentName] = { package: agentName };
  }
  const agentEntry = agents[agentName] as Record<string, unknown>;

  // Deep-merge config into existing config
  const existing = (typeof agentEntry.config === "object" && agentEntry.config !== null && !Array.isArray(agentEntry.config))
    ? agentEntry.config as Record<string, unknown>
    : {};

  for (const [groupKey, groupFields] of Object.entries(config)) {
    const existingGroup = (typeof existing[groupKey] === "object" && existing[groupKey] !== null && !Array.isArray(existing[groupKey]))
      ? existing[groupKey] as Record<string, unknown>
      : {};

    existing[groupKey] = { ...existingGroup, ...groupFields };
  }

  agentEntry.config = existing;

  writeMasonConfigAtomic(projectDir, raw);
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

// ── Alias Config Loading ──────────────────────────────────────────────

/**
 * Parse and validate a raw alias config entry.
 * Returns null if the entry is invalid (missing or invalid agent field).
 * @param name - The alias key name
 * @param raw - The raw value from config.json
 * @param knownAgentNames - Set of valid agent keys for validation
 */
function parseAliasEntryConfig(
  name: string,
  raw: unknown,
  knownAgentNames: Set<string>,
): AliasEntryConfig | null {
  if (!raw || typeof raw !== "object") {
    console.warn(`[agent-sdk] Invalid alias config for "${name}": must be an object`);
    return null;
  }
  const obj = raw as Record<string, unknown>;

  if (typeof obj.agent !== "string") {
    console.warn(`[agent-sdk] Invalid alias config for "${name}": missing "agent" field`);
    return null;
  }

  if (!knownAgentNames.has(obj.agent)) {
    console.error(`[agent-sdk] Alias "${name}" references unknown agent "${obj.agent}"`);
    process.exit(1);
  }

  const entry: AliasEntryConfig = { agent: obj.agent };

  if (obj.mode !== undefined) {
    if (typeof obj.mode === "string" && VALID_MODES.has(obj.mode)) {
      entry.mode = obj.mode as "terminal" | "acp" | "bash";
    } else {
      console.warn(
        `[agent-sdk] Alias "${name}" has invalid mode "${String(obj.mode)}" (expected terminal, acp, or bash). Defaulting to terminal.`,
      );
      entry.mode = "terminal";
    }
  }

  if (obj.role !== undefined && typeof obj.role === "string") {
    entry.role = obj.role;
  }

  if (obj.home !== undefined && typeof obj.home === "string") {
    entry.home = obj.home;
  }

  if (obj["dev-container-customizations"] !== undefined &&
      typeof obj["dev-container-customizations"] === "object" &&
      obj["dev-container-customizations"] !== null) {
    entry.devContainerCustomizations = obj["dev-container-customizations"] as DevContainerCustomizations;
  }

  if (obj.credentials !== undefined) {
    if (!Array.isArray(obj.credentials)) {
      console.warn(`[agent-sdk] Alias "${name}" has invalid credentials value (expected array). Ignoring.`);
    } else {
      const validKeys: string[] = [];
      for (const item of obj.credentials) {
        if (typeof item === "string") {
          validKeys.push(item);
        } else {
          console.warn(`[agent-sdk] Alias "${name}" credentials contains non-string entry "${String(item)}". Skipping.`);
        }
      }
      entry.credentials = validKeys;
    }
  }

  if (obj["agent-args"] !== undefined) {
    if (!Array.isArray(obj["agent-args"])) {
      console.warn(`[agent-sdk] Alias "${name}" has invalid agent-args value (expected array). Ignoring.`);
    } else {
      const validArgs: string[] = [];
      for (const item of obj["agent-args"]) {
        if (typeof item === "string") {
          validArgs.push(item);
        } else {
          console.warn(`[agent-sdk] Alias "${name}" agent-args contains non-string entry "${String(item)}". Skipping.`);
        }
      }
      entry.agentArgs = validArgs;
    }
  }

  return entry;
}

/**
 * Return the validated alias config entry for a named alias from .mason/config.json.
 * Synchronous — no dynamic imports.
 *
 * @returns The AliasEntryConfig, or undefined if absent or invalid.
 */
export function loadConfigAliasEntry(projectDir: string, aliasName: string): AliasEntryConfig | undefined {
  const config = readMasonConfig(projectDir);
  if (!config?.aliases) return undefined;

  const raw = config.aliases[aliasName];
  if (raw === undefined) return undefined;

  const knownAgentNames = new Set(Object.keys(config.agents ?? {}));
  const entry = parseAliasEntryConfig(aliasName, raw, knownAgentNames);
  return entry ?? undefined;
}

/**
 * Return all alias key names declared in .mason/config.json.
 * Synchronous — no dynamic imports.
 *
 * @returns Array of alias key names, or empty array if the file is absent or unparseable.
 */
export function readConfigAliasNames(projectDir: string): string[] {
  const config = readMasonConfig(projectDir);
  if (!config?.aliases || typeof config.aliases !== "object") return [];
  return Object.keys(config.aliases);
}
