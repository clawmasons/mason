import type { ResolvedAgent } from "@clawmasons/shared";

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
}

/**
 * The contract all runtime materializers implement.
 *
 * A materializer translates the abstract chapter dependency graph into
 * a specific runtime's native configuration format.
 */
export interface RuntimeMaterializer {
  /** Runtime identifier (e.g., "claude-code", "mcp-agent"). */
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
}

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

  /** Alternative names for this agent (e.g., "claude" for "claude-code"). */
  aliases?: string[];

  /** The workspace materialization implementation. */
  materializer: RuntimeMaterializer;

  /** Dockerfile generation hooks. */
  dockerfile?: DockerfileConfig;

  /** ACP mode configuration. */
  acp?: AcpConfig;

  /** Runtime command configuration for agent-launch.json. */
  runtime?: RuntimeConfig;
}
