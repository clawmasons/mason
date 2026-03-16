// Re-export helpers from the agent SDK for backward compatibility
export {
  PROVIDER_ENV_VARS,
  formatPermittedTools,
  findRolesForTask,
  collectAllSkills,
  collectAllTasks,
  generateAgentsMd,
  generateSkillReadme,
} from "@clawmasons/agent-sdk";
export type { LaunchCredentialConfig } from "@clawmasons/agent-sdk";

// Re-export generateAgentLaunchJson with the legacy signature for backward compat.
// The SDK version takes an AgentPackage; this wrapper resolves it from the registry.
import type { AgentPackage } from "@clawmasons/agent-sdk";
import { generateAgentLaunchJson as sdkGenerateAgentLaunchJson } from "@clawmasons/agent-sdk";
import { getAgentFromRegistry } from "./role-materializer.js";

/**
 * Legacy ACP_RUNTIME_COMMANDS map.
 * @deprecated Use AgentPackage.acp.command instead via the agent registry.
 */
export const ACP_RUNTIME_COMMANDS: Record<string, string> = {
  "claude-code": "claude-agent-acp",
  "pi-coding-agent": "pi-agent-acp",
  "node": "node src/index.js --acp",
  "mcp-agent": "mcp-agent --acp",
};

/**
 * Generate agent-launch.json content.
 *
 * Legacy wrapper that resolves the AgentPackage from the registry
 * and delegates to the SDK's generateAgentLaunchJson.
 *
 * @deprecated Import from agent packages directly.
 */
export function generateAgentLaunchJson(
  runtime: string,
  roleCredentials: string[],
  acpMode?: boolean,
  instructions?: string,
): string {
  const agentPkg = getAgentFromRegistry(runtime);
  if (agentPkg) {
    return sdkGenerateAgentLaunchJson(agentPkg, roleCredentials, acpMode, instructions);
  }

  // Fallback for unknown runtimes: create a minimal AgentPackage-like object
  const fallbackPkg: AgentPackage = {
    name: runtime,
    materializer: { name: runtime, materializeWorkspace: () => new Map() },
    runtime: { command: runtime },
    acp: ACP_RUNTIME_COMMANDS[runtime] ? { command: ACP_RUNTIME_COMMANDS[runtime] } : undefined,
  };
  return sdkGenerateAgentLaunchJson(fallbackPkg, roleCredentials, acpMode, instructions);
}
