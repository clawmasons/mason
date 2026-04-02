import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import type { AgentPackage } from "./types.js";
import { sdkLogger } from "./logger.js";

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
  mode?: "terminal" | "bash";
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
  mode?: "terminal" | "bash";
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
  defaultAgent?: string;
}

const VALID_MODES = new Set<string>(["terminal", "bash"]);

/**
 * Parse and validate a raw config entry. Returns null if the entry is invalid (missing package).
 * Warns and normalises invalid mode values.
 */
function parseEntryConfig(name: string, raw: unknown): AgentEntryConfig | null {
  if (!raw || typeof raw !== "object") {
    sdkLogger.warn(`Invalid agent config for "${name}": missing "package" field`);
    return null;
  }
  const obj = raw as Record<string, unknown>;

  if (typeof obj.package !== "string") {
    sdkLogger.warn(`Invalid agent config for "${name}": missing "package" field`);
    return null;
  }

  const entry: AgentEntryConfig = { package: obj.package };

  // Detect deprecated runtime fields and warn once with all offending keys
  const runtimeFields = ["home", "mode", "role", "credentials", "dev-container-customizations"] as const;
  const foundDeprecated = runtimeFields.filter((f) => obj[f] !== undefined);
  if (foundDeprecated.length > 0) {
    sdkLogger.warn(
      `Agent "${name}" has runtime fields (${foundDeprecated.join(", ")}) in the "agents" config. ` +
      `Move these to an "aliases" entry. Runtime fields in "agents" will be removed in a future version.`,
    );
  }

  if (obj.home !== undefined && typeof obj.home === "string") {
    entry.home = obj.home; // deprecated field — still parsed during deprecation period
  }

  if (obj.mode !== undefined) {
    if (typeof obj.mode === "string" && VALID_MODES.has(obj.mode)) {
      entry.mode = obj.mode as "terminal" | "bash"; // deprecated
    } else {
      sdkLogger.warn(
        `Agent "${name}" has invalid mode "${String(obj.mode)}" (expected terminal or bash). Defaulting to terminal.`,
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
      sdkLogger.warn(`Agent "${name}" has invalid credentials value (expected array). Ignoring.`);
    } else {
      const validKeys: string[] = [];
      for (const item of obj.credentials) {
        if (typeof item === "string") {
          validKeys.push(item);
        } else {
          sdkLogger.warn(`Agent "${name}" credentials contains non-string entry "${String(item)}". Skipping.`);
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
    sdkLogger.warn(`Failed to parse .mason/config.json`);
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
 * Discover agent packages installed in `.mason/node_modules/@clawmasons/`.
 *
 * Scans for directories whose `package.json` declares `mason.type: "agent"`.
 * For each qualifying package, dynamically imports the entrypoint specified by
 * `mason.entrypoint` (defaulting to `./dist/index.js`) and validates that the
 * default export is a valid `AgentPackage`.
 *
 * Packages that fail to load are skipped with a warning — this function never throws.
 *
 * @param projectDir - Absolute path to the project root
 * @returns Array of discovered AgentPackage objects
 */
export async function discoverInstalledAgents(projectDir: string): Promise<AgentPackage[]> {
  const scopeDir = path.join(projectDir, ".mason", "node_modules", "@clawmasons");

  if (!fs.existsSync(scopeDir)) {
    return [];
  }

  let entries: string[];
  try {
    entries = fs.readdirSync(scopeDir);
  } catch {
    return [];
  }

  const agents: AgentPackage[] = [];

  for (const entry of entries) {
    const pkgDir = path.join(scopeDir, entry);

    // Skip non-directories
    let stat: fs.Stats;
    try {
      stat = fs.statSync(pkgDir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    // Read package.json
    const pkgJsonPath = path.join(pkgDir, "package.json");
    if (!fs.existsSync(pkgJsonPath)) continue;

    let pkgJson: Record<string, unknown>;
    try {
      const raw = fs.readFileSync(pkgJsonPath, "utf-8");
      pkgJson = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      sdkLogger.warn(`Failed to parse package.json in ${pkgDir}`);
      continue;
    }

    // Check mason.type === "agent"
    const masonField = pkgJson.mason;
    if (!masonField || typeof masonField !== "object") continue;
    const masonObj = masonField as Record<string, unknown>;
    if (masonObj.type !== "agent") continue;

    // Resolve entrypoint
    const entrypoint = typeof masonObj.entrypoint === "string"
      ? masonObj.entrypoint
      : "./dist/index.js";
    const entrypointPath = path.resolve(pkgDir, entrypoint);

    // Dynamic import
    try {
      const mod = await import(entrypointPath) as { default?: unknown };
      // Handle CJS interop: when importing a CJS module that sets
      // `exports.default = ...`, Node wraps module.exports as `mod.default`,
      // so the actual value ends up at `mod.default.default`.
      let agentPkg = mod.default;
      if (
        agentPkg &&
        typeof agentPkg === "object" &&
        "default" in agentPkg &&
        !isValidAgentPackage(agentPkg)
      ) {
        agentPkg = (agentPkg as Record<string, unknown>).default;
      }

      if (!isValidAgentPackage(agentPkg)) {
        sdkLogger.warn(
          `Package "@clawmasons/${entry}" does not export a valid AgentPackage (missing name or materializer)`,
        );
        continue;
      }

      agents.push(agentPkg);
    } catch (err) {
      sdkLogger.warn(
        `Failed to load agent from "@clawmasons/${entry}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return agents;
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
      // Resolve from projectDir/.mason/node_modules/ so the import
      // respects the project's installed/symlinked packages
      const masonRequire = createRequire(
        path.join(projectDir, ".mason", "node_modules", "_resolver.cjs"),
      );
      let resolvedPath: string;

      // Prefer mason.entrypoint from the package's package.json (same as
      // discoverInstalledAgents) so packages whose `main` is a CLI binary
      // still load correctly as agent packages.
      // We read package.json directly from node_modules rather than using
      // require.resolve(), because the package's `exports` field may block
      // resolving package.json.
      const pkgDir = path.join(
        projectDir, ".mason", "node_modules", ...entry.package.split("/"),
      );
      const pkgJsonPath = path.join(pkgDir, "package.json");
      let masonEntrypoint: string | undefined;
      try {
        const pkgJson = JSON.parse(
          fs.readFileSync(pkgJsonPath, "utf-8"),
        ) as Record<string, unknown>;
        const masonField = pkgJson.mason;
        if (
          masonField &&
          typeof masonField === "object" &&
          typeof (masonField as Record<string, unknown>).entrypoint === "string"
        ) {
          masonEntrypoint = (masonField as Record<string, unknown>).entrypoint as string;
        }
      } catch {
        // package.json not readable — fall through to require.resolve
      }

      if (masonEntrypoint) {
        resolvedPath = path.resolve(pkgDir, masonEntrypoint);
      } else {
        try {
          resolvedPath = masonRequire.resolve(entry.package);
        } catch {
          resolvedPath = entry.package;
        }
      }
      const mod = await import(resolvedPath) as { default?: unknown };
      // Handle CJS interop: when importing a CJS module that sets
      // `exports.default = ...`, Node wraps module.exports as `mod.default`,
      // so the actual value ends up at `mod.default.default`.
      let agentPkg = mod.default;
      if (
        agentPkg &&
        typeof agentPkg === "object" &&
        "default" in agentPkg &&
        !isValidAgentPackage(agentPkg)
      ) {
        agentPkg = (agentPkg as Record<string, unknown>).default;
      }

      if (!isValidAgentPackage(agentPkg)) {
        sdkLogger.warn(
          `Package "${entry.package}" does not export a valid AgentPackage`,
        );
        continue;
      }

      agents.push(agentPkg);
    } catch {
      sdkLogger.warn(
        `Agent package "${entry.package}" not found. Install it with: npm install ${entry.package}`,
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
 * Read the optional `defaultAgent` field from `.mason/config.json`.
 * Synchronous — safe to call before the async registry is initialised.
 *
 * @returns The default agent name, or undefined if not set.
 */
export function readDefaultAgent(projectDir: string): string | undefined {
  const config = readMasonConfig(projectDir);
  if (config?.defaultAgent && typeof config.defaultAgent === "string") {
    return config.defaultAgent;
  }
  return undefined;
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

  if (projectDir) {
    // Phase 2: Discover installed agents from .mason/node_modules/
    // Discovered agents do NOT override built-ins.
    const discoveredAgents = await discoverInstalledAgents(projectDir);
    for (const agent of discoveredAgents) {
      if (!registry.has(agent.name)) {
        registerAgent(registry, agent);
      }
    }

    // Phase 3: Load and register config-declared agents (can override everything)
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
    sdkLogger.warn(`Invalid alias config for "${name}": must be an object`);
    return null;
  }
  const obj = raw as Record<string, unknown>;

  if (typeof obj.agent !== "string") {
    sdkLogger.warn(`Invalid alias config for "${name}": missing "agent" field`);
    return null;
  }

  if (!knownAgentNames.has(obj.agent)) {
    sdkLogger.error(`Alias "${name}" references unknown agent "${obj.agent}"`);
    process.exit(1);
  }

  const entry: AliasEntryConfig = { agent: obj.agent };

  if (obj.mode !== undefined) {
    if (typeof obj.mode === "string" && VALID_MODES.has(obj.mode)) {
      entry.mode = obj.mode as "terminal" | "bash";
    } else {
      sdkLogger.warn(
        `Alias "${name}" has invalid mode "${String(obj.mode)}" (expected terminal or bash). Defaulting to terminal.`,
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
      sdkLogger.warn(`Alias "${name}" has invalid credentials value (expected array). Ignoring.`);
    } else {
      const validKeys: string[] = [];
      for (const item of obj.credentials) {
        if (typeof item === "string") {
          validKeys.push(item);
        } else {
          sdkLogger.warn(`Alias "${name}" credentials contains non-string entry "${String(item)}". Skipping.`);
        }
      }
      entry.credentials = validKeys;
    }
  }

  if (obj["agent-args"] !== undefined) {
    if (!Array.isArray(obj["agent-args"])) {
      sdkLogger.warn(`Alias "${name}" has invalid agent-args value (expected array). Ignoring.`);
    } else {
      const validArgs: string[] = [];
      for (const item of obj["agent-args"]) {
        if (typeof item === "string") {
          validArgs.push(item);
        } else {
          sdkLogger.warn(`Alias "${name}" agent-args contains non-string entry "${String(item)}". Skipping.`);
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

// ── Agent Name Resolution & Auto-Install ──────────────────────────────

/**
 * Map of short agent names / aliases to their full npm package names.
 */
const AGENT_SHORT_NAMES: Record<string, string> = {
  "claude": "@clawmasons/claude-code-agent",
  "claude-code": "@clawmasons/claude-code-agent",
  "pi": "@clawmasons/pi-coding-agent",
  "pi-coding": "@clawmasons/pi-coding-agent",
  "codex": "@clawmasons/codex-agent",
};

/**
 * Resolve a user-supplied agent name to its npm package name.
 *
 * - Known short names (e.g., "claude", "pi", "codex") map to `@clawmasons/*` packages.
 * - Scoped package names (e.g., `@mycompany/custom-agent`) are returned as-is.
 * - Unknown unscoped names return null.
 *
 * @param agentName - The agent name as provided by the user
 * @returns The npm package name, or null if the name cannot be resolved
 */
export function resolveAgentPackageName(agentName: string): string | null {
  // Check short name map first
  const mapped = AGENT_SHORT_NAMES[agentName];
  if (mapped) return mapped;

  // Scoped npm package name — use as-is
  if (agentName.startsWith("@") && agentName.includes("/")) {
    return agentName;
  }

  return null;
}

/**
 * Ensure `.mason/package.json` exists in the given project directory.
 *
 * Creates the file with a minimal `{ name, private, dependencies }` skeleton
 * when it doesn't exist. No-op if the file is already present.
 *
 * @param projectDir - Absolute path to the project root
 */
export function ensureMasonPackageJson(projectDir: string): void {
  const masonDir = path.join(projectDir, ".mason");
  const pkgJsonPath = path.join(masonDir, "package.json");

  if (fs.existsSync(pkgJsonPath)) return;

  fs.mkdirSync(masonDir, { recursive: true });
  const skeleton = {
    name: "mason-extensions",
    private: true,
    dependencies: {} as Record<string, string>,
  };
  fs.writeFileSync(pkgJsonPath, JSON.stringify(skeleton, null, 2) + "\n", "utf-8");
}

/**
 * Check whether any package in `.mason/node_modules/@clawmasons/` is a symlink.
 * Symlinks indicate a dev environment where local sources are linked in
 * (e.g. via `scripts/mason.js`). In that case, `npm update` should be skipped
 * to avoid overwriting dev symlinks with registry versions.
 */
export function hasDevSymlinks(projectDir: string): boolean {
  const scopeDir = path.join(projectDir, ".mason", "node_modules", "@clawmasons");
  let entries: string[];
  try {
    entries = fs.readdirSync(scopeDir);
  } catch {
    return false;
  }
  for (const entry of entries) {
    try {
      if (fs.lstatSync(path.join(scopeDir, entry)).isSymbolicLink()) return true;
    } catch { /* skip */ }
  }
  return false;
}

/**
 * Auto-install an agent package into `.mason/node_modules/`.
 *
 * Writes (or updates) the dependency in `.mason/package.json` with a tilde-pinned
 * version matching the CLI version, then runs `npm update` to install it.
 *
 * @param projectDir  - Absolute path to the project root
 * @param packageName - Full npm package name (e.g., `@clawmasons/claude-code-agent`)
 * @param cliVersion  - The current CLI version string (e.g., "0.1.6")
 */
export function autoInstallAgent(projectDir: string, packageName: string, cliVersion: string): void {
  ensureMasonPackageJson(projectDir);

  const pkgJsonPath = path.join(projectDir, ".mason", "package.json");
  const raw = fs.readFileSync(pkgJsonPath, "utf-8");
  const pkgJson = JSON.parse(raw) as Record<string, unknown>;

  if (!pkgJson.dependencies || typeof pkgJson.dependencies !== "object") {
    pkgJson.dependencies = {};
  }
  const deps = pkgJson.dependencies as Record<string, string>;
  deps[packageName] = `~${cliVersion}`;

  fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + "\n", "utf-8");

  if (!hasDevSymlinks(projectDir)) {
    const masonDir = path.join(projectDir, ".mason");
    execSync("npm update", { cwd: masonDir, stdio: "inherit" });
  }
}

/**
 * Synchronize all extension dependency versions in `.mason/package.json`
 * to match the current CLI version (tilde-pinned).
 *
 * Rewrites every dependency to `~{cliVersion}` and runs `npm update`.
 * No-op if `.mason/package.json` doesn't exist or has no dependencies.
 *
 * @param projectDir - Absolute path to the project root
 * @param cliVersion - The current CLI version string (e.g., "0.1.6")
 */
export function syncExtensionVersions(projectDir: string, cliVersion: string): void {
  const pkgJsonPath = path.join(projectDir, ".mason", "package.json");
  if (!fs.existsSync(pkgJsonPath)) return;

  const raw = fs.readFileSync(pkgJsonPath, "utf-8");
  const pkgJson = JSON.parse(raw) as Record<string, unknown>;

  if (!pkgJson.dependencies || typeof pkgJson.dependencies !== "object") return;

  const deps = pkgJson.dependencies as Record<string, string>;
  const depNames = Object.keys(deps);
  if (depNames.length === 0) return;

  for (const name of depNames) {
    deps[name] = `~${cliVersion}`;
  }

  fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + "\n", "utf-8");

  if (!hasDevSymlinks(projectDir)) {
    const masonDir = path.join(projectDir, ".mason");
    execSync("npm update", { cwd: masonDir, stdio: "inherit" });
  }
}

/**
 * High-level agent resolution with auto-install fallback.
 *
 * 1. If the agent is already in the registry, return it immediately.
 * 2. Otherwise, resolve the name to an npm package, auto-install it,
 *    re-discover installed agents, and return the newly available agent (or null).
 *
 * @param projectDir  - Absolute path to the project root
 * @param agentName   - The agent name as provided by the user
 * @param cliVersion  - The current CLI version string
 * @param registry    - The existing agent registry
 * @returns The resolved AgentPackage, or null if resolution/install failed
 */
export async function resolveAgentWithAutoInstall(
  projectDir: string,
  agentName: string,
  cliVersion: string,
  registry: AgentRegistry,
): Promise<AgentPackage | null> {
  // Already in registry — return immediately
  const existing = registry.get(agentName);
  if (existing) return existing;

  // Resolve short name to package name
  const packageName = resolveAgentPackageName(agentName);
  if (!packageName) return null;

  // Auto-install the package
  try {
    autoInstallAgent(projectDir, packageName, cliVersion);
  } catch (err) {
    sdkLogger.warn(
      `Failed to auto-install "${packageName}": ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }

  // Re-discover installed agents
  const discovered = await discoverInstalledAgents(projectDir);
  for (const agent of discovered) {
    registerAgent(registry, agent);
  }

  // Try to find the agent again
  return registry.get(agentName) ?? null;
}
