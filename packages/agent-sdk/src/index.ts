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
  loadConfigAgentEntry,
  readConfigAgentNames,
  getAgent,
  getRegisteredAgentNames,
} from "./discovery.js";
export type { AgentRegistry, AgentEntryConfig, DevContainerCustomizations, DevContainerVscodeCustomizations } from "./discovery.js";
export { DEFAULT_DEV_CONTAINER_CUSTOMIZATIONS } from "./discovery.js";

// Re-exports from @clawmasons/shared for convenience
export type {
  ResolvedAgent,
  ResolvedRole,
  ResolvedTask,
  ResolvedSkill,
} from "@clawmasons/shared";
export { getAppShortName } from "@clawmasons/shared";
