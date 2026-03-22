import type { ResolvedAgent, AgentSkillConfig, AgentTaskConfig } from "@clawmasons/shared";
import type {
  AgentConfigSchema,
  AgentCredentialRequirement,
  AgentValidationResult,
} from "./config-schema.js";

// ── Core Materializer Types (moved from packages/cli/src/materializer/types.ts) ──

/**
 * A map of relative file paths to their string content.
 * Keys are paths relative to the workspace root (e.g., ".claude/settings.json").
 */
export type MaterializationResult = Map<string, string>;

/**
 * Options for workspace materialization.
 */
export interface MaterializeOptions {
  /** When true, generate ACP agent configuration alongside standard workspace files. */
  acpMode?: boolean;
  /** Additional credential env var keys from agent config (.mason/config.json). Merged into agent-launch.json credentials. */
  agentConfigCredentials?: string[];
  /** Extra args from alias config appended to the agent invocation after all mason-resolved args. */
  agentArgs?: string[];
  /** Initial prompt passed to the agent as the first user message at launch. */
  initialPrompt?: string;
  /** LLM configuration resolved from agent config schema. Applied to ResolvedAgent.llm before materialization. */
  llmConfig?: { provider: string; model: string };
}

/**
 * The contract all runtime materializers implement.
 *
 * A materializer translates the abstract dependency graph into
 * a specific runtime's native configuration format.
 */
export interface RuntimeMaterializer {
  /** Runtime identifier (e.g., "claude-code-agent", "mcp-agent"). */
  name: string;

  /**
   * Generate workspace file content for this runtime.
   * Returns a map of relative paths -> file content strings.
   * The caller handles writing files to disk.
   */
  materializeWorkspace(
    agent: ResolvedAgent,
    proxyEndpoint: string,
    proxyToken?: string,
    options?: MaterializeOptions,
    existingHomePath?: string,
  ): MaterializationResult;

  /**
   * Materialize host configuration into the agent's home directory.
   * Writes directly to disk (copies directory trees, binary files).
   * Optional — agents without home materialization simply omit this method.
   *
   * @param projectDir - Absolute path to the project root on the host
   * @param homePath - Absolute path to the target home directory
   */
  materializeHome?(projectDir: string, homePath: string): void;

  /**
   * Generate home-directory file content for a supervisor role.
   *
   * Returns a map of home-relative paths → file content (ready to write verbatim).
   * The caller writes every entry to the home build dir, except "agent-launch.json"
   * which is always routed to the workspace dir.
   *
   * @param existingHomePath - If provided, the materializer may read existing files
   *   (e.g., host .claude.json written by materializeHome) to produce merged output.
   *
   * Agents that do not support supervisor roles omit this method.
   */
  materializeSupervisor?(
    agent: ResolvedAgent,
    proxyEndpoint: string,
    proxyToken?: string,
    options?: MaterializeOptions,
    existingHomePath?: string,
  ): MaterializationResult;
}

// Re-export AgentTaskConfig from shared (canonical definition lives in @clawmasons/shared)
export type { AgentTaskConfig } from "@clawmasons/shared";

// ── Agent Package Types ──

/**
 * Dockerfile generation hooks for an agent package.
 */
export interface DockerfileConfig {
  /** Default base Docker image (e.g., "node:22-slim"). */
  baseImage?: string;
  /** Dockerfile RUN instructions to install the agent runtime (raw Dockerfile lines). */
  installSteps?: string;
  /** Additional apt packages required by the agent runtime. */
  aptPackages?: string[];
  /** Additional npm packages to install globally in the agent container. */
  npmPackages?: string[];
}

/**
 * ACP mode configuration for an agent package.
 */
export interface AcpConfig {
  /** Command to start the agent in ACP mode (e.g., "claude-agent-acp"). */
  command: string;
}

/**
 * Runtime command configuration for agent-launch.json generation.
 */
export interface RuntimeConfig {
  /** Default command to run the agent (e.g., "claude"). */
  command: string;
  /** Default command arguments (e.g., ["--effort", "max"]). */
  args?: string[];
  /** Additional credentials the runtime always requires. */
  credentials?: Array<{
    key: string;
    type: "env" | "file";
    path?: string;
  }>;
  /** When true, the runtime accepts role instructions via --append-system-prompt <text>. */
  supportsAppendSystemPrompt?: boolean;
}

/**
 * The primary contract for agent packages.
 *
 * Every agent package exports an `AgentPackage` object as its default export.
 * The CLI uses this interface to discover agent capabilities, generate
 * workspace files, Dockerfiles, and launch configurations.
 */
export interface AgentPackage {
  /** Primary agent type identifier used in `mason run --agent <name>`. */
  name: string;

  /** Alternative names for this agent (e.g., "claude" for "claude-code-agent"). */
  aliases?: string[];

  /** The workspace materialization implementation. */
  materializer: RuntimeMaterializer;

  /** Dockerfile generation hooks. */
  dockerfile?: DockerfileConfig;

  /** ACP mode configuration. */
  acp?: AcpConfig;

  /** Runtime command configuration for agent-launch.json. */
  runtime?: RuntimeConfig;

  /** Declarative task file layout config. Drives readTasks() and materializeTasks(). */
  tasks?: AgentTaskConfig;

  /** Declarative skill file layout config. Drives readSkills() and materializeSkills(). */
  skills?: AgentSkillConfig;

  // ── Agent Config Framework (PRD: agent-config) ──

  /** Declarative configuration schema. Groups of fields the CLI prompts for when missing. */
  configSchema?: AgentConfigSchema;

  /**
   * Dynamic credential requirements computed from resolved config values.
   * Called after configSchema fields are resolved, allowing credentials
   * to depend on config values (e.g., different provider -> different API key).
   */
  credentialsFn?: (config: Record<string, string>) => AgentCredentialRequirement[];

  /** Scanner dialect key for self-registration with the dialect registry. */
  dialect?: string;

  /**
   * ROLE.md frontmatter field name overrides for this agent's dialect.
   * When omitted, defaults to: tasks="tasks", apps="mcp_servers", skills="skills".
   */
  dialectFields?: {
    tasks?: string;
    apps?: string;
    skills?: string;
  };

  /**
   * Agent-specific validation.
   * Called during the validation phase with the fully resolved agent.
   * Returns errors and warnings without requiring CLI-side conditionals.
   */
  validate?: (agent: ResolvedAgent) => AgentValidationResult;
}
