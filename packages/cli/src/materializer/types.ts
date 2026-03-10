import type { ResolvedAgent } from "@clawmasons/shared";

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
  /** Runtime identifier (e.g., "claude-code", "codex"). */
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
}
