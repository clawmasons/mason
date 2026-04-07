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
  /** When true, enable print mode: append JSON stream args and -p flag in agent-launch.json. */
  printMode?: boolean;
  /** When true, enable JSON streaming mode: append jsonMode.jsonStreamArgs and prompt args in agent-launch.json. */
  jsonMode?: boolean;
}

/**
 * The contract all runtime materializers implement.
 *
 * A materializer translates the abstract dependency graph into
 * a specific runtime's native configuration format.
 */
export interface RuntimeMaterializer {
  /** Runtime identifier (e.g., "claude-code-agent", "codex-agent"). */
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

// ── ACP Session Update Types ──
// These types mirror the official ACP spec from @agentclientprotocol/sdk.
// Tool call fields are FLAT on the session update object (not nested in a wrapper).

/**
 * Categories of tools that can be invoked.
 * Matches the ACP spec ToolKind enum.
 */
export type ToolKind = "read" | "edit" | "delete" | "move" | "search" | "execute" | "think" | "fetch" | "switch_mode" | "other";

/**
 * Execution status of a tool call.
 * Matches the ACP spec ToolCallStatus enum.
 */
export type ToolCallStatus = "pending" | "in_progress" | "completed" | "failed";

/** Content produced by a tool call. */
export type ToolCallContent = { type: "content"; content: { type: "text"; text: string } };

/**
 * Fields for a `tool_call` session update (creating a new tool call).
 * Per ACP spec, `title` is required and fields are flat on the update object.
 */
export interface AcpToolCallFields {
  toolCallId: string;
  title: string;
  kind?: ToolKind;
  status?: ToolCallStatus;
  content?: Array<ToolCallContent>;
}

/**
 * Fields for a `tool_call_update` session update (updating an existing tool call).
 * Per ACP spec, only `toolCallId` is required; all other fields are optional.
 */
export interface AcpToolCallUpdateFields {
  toolCallId: string;
  title?: string | null;
  kind?: ToolKind | null;
  status?: ToolCallStatus | null;
  content?: Array<ToolCallContent> | null;
}

/**
 * @deprecated Use `AcpToolCallFields` or `AcpToolCallUpdateFields` instead.
 * This nested wrapper does not match the ACP spec (fields should be flat).
 */
export interface ToolCallInfo {
  toolCallId: string;
  title?: string;
  kind?: string;
  status: "in_progress" | "completed";
  content?: Array<ToolCallContent>;
}

/**
 * Discriminated union of ACP session update types.
 * Each variant is identified by its `sessionUpdate` field.
 *
 * Tool call fields are FLAT on the update object, matching the official ACP spec
 * (`ToolCall & { sessionUpdate: "tool_call" }`).
 *
 * Used as the return type of `jsonMode.parseJsonStreamAsACP` and by the ACP
 * prompt executor when forwarding updates to the editor.
 */
export type AcpSessionUpdate =
  | { sessionUpdate: "agent_message_chunk"; content: { type: "text"; text: string } }
  | ({ sessionUpdate: "tool_call" } & AcpToolCallFields)
  | ({ sessionUpdate: "tool_call_update" } & AcpToolCallUpdateFields)
  | { sessionUpdate: "agent_thought_chunk"; content: { type: "text"; text: string } }
  | { sessionUpdate: "plan"; entries: Array<{ content: string; priority: "high" | "medium" | "low"; status: "pending" | "in_progress" | "completed" }> }
  | { sessionUpdate: "current_mode_update"; modeId: string };

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
   * When omitted, defaults to: tasks="tasks", mcp="mcp", skills="skills".
   */
  dialectFields?: {
    tasks?: string;
    mcp?: string;
    skills?: string;
  };

  /**
   * Agent-specific validation.
   * Called during the validation phase with the fully resolved agent.
   * Returns errors and warnings without requiring CLI-side conditionals.
   */
  validate?: (agent: ResolvedAgent) => AgentValidationResult;

  /**
   * MCP tool name template for this agent runtime.
   * Used to rewrite `mcp__{server}__{tool}` references in task/skill files during materialization.
   * Supports `${server}` and `${tool}` placeholders. Defaults to `${server}_${tool}`.
   */
  mcpNameTemplate?: string;

  /** JSON streaming mode configuration for ACP session update streaming. */
  jsonMode?: {
    /** Args to append to agent command to enable JSON streaming output. */
    jsonStreamArgs: string[];
    /**
     * Build the CLI args that pass the initial prompt to the agent.
     * Defaults to `["-p", prompt]` when not defined.
     */
    buildPromptArgs?: (prompt: string) => string[];
    /**
     * Parse a line from the agent's JSON stream and convert it to an ACP session update.
     * Return an ACP session update object when the line maps to one, or null to skip.
     * Called with try/catch — exceptions are logged and the line is skipped.
     *
     * @param line - The current JSON stream line from the agent
     * @param previousLine - The previous JSON-parseable line (if any)
     * @returns An ACP session update, an array of updates (for multi-block events), or null to skip
     */
    parseJsonStreamAsACP(line: string, previousLine?: string): AcpSessionUpdate | AcpSessionUpdate[] | null;
  };

  /** Session resume configuration. When present, the CLI can inject resume arguments into agent-launch.json. */
  resume?: {
    /** CLI argument flag for resuming (e.g., "--resume"). */
    flag: string;
    /** meta.json field containing the agent's session ID (e.g., "agentSessionId"). */
    sessionIdField: string;
    /** Where to insert resume args: "append" (default) adds at end, "after-first" inserts after the first arg. */
    position?: "append" | "after-first";
  };

  /** Print mode configuration for non-interactive prompt execution with JSON streaming. */
  printMode?: {
    /** Args to append to agent command to enable JSON streaming output. */
    jsonStreamArgs: string[];
    /**
     * Build the CLI args that pass the initial prompt to the agent.
     * Defaults to `["-p", prompt]` when not defined.
     */
    buildPromptArgs?: (prompt: string) => string[];
    /**
     * Parse a line from the JSON stream. Return the final result text when found, or null to keep reading.
     * Called with try/catch — exceptions are logged and treated as null.
     * @param line - The current JSON stream line
     * @param previousLine - The previous JSON-looking line from the stream (if any)
     */
    parseJsonStreamFinalResult(line: string, previousLine?: string): string | null;
  };
}
