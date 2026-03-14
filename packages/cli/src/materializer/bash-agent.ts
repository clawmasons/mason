import type { ResolvedAgent } from "@clawmasons/shared";
import type { RuntimeMaterializer, MaterializationResult } from "./types.js";
import { generateAgentsMd, generateAgentLaunchJson } from "./common.js";

/**
 * Bash Agent runtime materializer.
 *
 * Generates a minimal workspace for an interactive bash shell:
 * - agent-launch.json — credential config (Claude credentials as file) + bash command
 * - AGENTS.md — agent identity and role documentation
 *
 * The bash-agent fetches the same credentials as claude-code
 * (security.CLAUDE_CODE_CREDENTIALS written to ~/.claude/.credentials.json)
 * but launches an interactive bash shell instead of the Claude CLI.
 * Useful for debugging and manual testing inside the agent VM.
 */
export const bashAgentMaterializer: RuntimeMaterializer = {
  name: "bash-agent",

  materializeWorkspace(
    agent: ResolvedAgent,
  ): MaterializationResult {
    const result: MaterializationResult = new Map();

    // agent-launch.json — credential config + bash command
    result.set(
      "agent-launch.json",
      generateAgentLaunchJson("bash-agent", agent.credentials),
    );

    // AGENTS.md — agent identity and role documentation
    result.set("AGENTS.md", generateAgentsMd(agent));

    return result;
  },
};
