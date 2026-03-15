// Types
export type {
  AgentPackage,
  DockerfileConfig,
  AcpConfig,
  RuntimeConfig,
  RuntimeMaterializer,
  MaterializationResult,
  MaterializeOptions,
} from "./types.js";

// Helpers
export {
  PROVIDER_ENV_VARS,
  formatPermittedTools,
  findRolesForTask,
  collectAllSkills,
  collectAllTasks,
  generateAgentsMd,
  generateAgentLaunchJson,
  generateSkillReadme,
} from "./helpers.js";
export type { LaunchCredentialConfig } from "./helpers.js";

// Discovery
export {
  createAgentRegistry,
  loadConfigAgents,
  getAgent,
  getRegisteredAgentNames,
} from "./discovery.js";
export type { AgentRegistry } from "./discovery.js";

// Re-exports from @clawmasons/shared for convenience
export type {
  ResolvedAgent,
  ResolvedRole,
  ResolvedTask,
  ResolvedSkill,
} from "@clawmasons/shared";
export { getAppShortName } from "@clawmasons/shared";
