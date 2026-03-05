import type { ResolvedAgent } from "../resolver/types.js";

/**
 * A map of relative file paths to their string content.
 * Keys are paths relative to the workspace root (e.g., ".claude/settings.json").
 */
export type MaterializationResult = Map<string, string>;

/**
 * A docker-compose service definition for a runtime container.
 */
export interface ComposeServiceDef {
  build: string;
  restart: string;
  volumes: string[];
  working_dir: string;
  environment: string[];
  depends_on: string[];
  stdin_open: boolean;
  tty: boolean;
  networks: string[];
}

/**
 * The contract all runtime materializers implement.
 *
 * A materializer translates the abstract forge dependency graph into
 * a specific runtime's native configuration format.
 */
export interface RuntimeMaterializer {
  /** Runtime identifier (e.g., "claude-code", "codex"). */
  name: string;

  /**
   * Generate workspace file content for this runtime.
   * Returns a map of relative paths → file content strings.
   * The caller handles writing files to disk.
   */
  materializeWorkspace(
    agent: ResolvedAgent,
    proxyEndpoint: string,
    proxyToken?: string,
  ): MaterializationResult;

  /** Generate a Dockerfile string for this runtime's container. */
  generateDockerfile(agent: ResolvedAgent): string;

  /** Generate a docker-compose service definition for this runtime. */
  generateComposeService(agent: ResolvedAgent): ComposeServiceDef;

  /** Generate runtime-specific config JSON (e.g., OOBE bypass for Claude Code). */
  generateConfigJson?(): string;
}
