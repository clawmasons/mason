// Types
export type {
  AgentPackage,
  AgentTaskConfig,
  DockerfileConfig,
  AcpConfig,
  RuntimeConfig,
  RuntimeMaterializer,
  MaterializationResult,
  MaterializeOptions,
} from "./types.js";

// Config Schema Types
export type {
  AgentConfigSchema,
  ConfigGroup,
  ConfigField,
  ConfigOption,
  AgentCredentialRequirement,
  AgentValidationError,
  AgentValidationWarning,
  AgentValidationResult,
} from "./config-schema.js";

// Helpers
export {
  PROVIDER_ENV_VARS,
  formatPermittedTools,
  findRolesForTask,
  collectAllSkills,
  collectAllTasks,
  generateAgentLaunchJson,
  readTask,
  readTasks,
  materializeTasks,
  readSkills,
  materializeSkills,
} from "./helpers.js";
export type { LaunchCredentialConfig } from "./helpers.js";

// Discovery
export {
  createAgentRegistry,
  loadConfigAgents,
  loadConfigAgentEntry,
  readConfigAgentNames,
  loadConfigAliasEntry,
  readConfigAliasNames,
  getAgent,
  getRegisteredAgentNames,
} from "./discovery.js";
export type { AgentRegistry, AgentEntryConfig, AliasEntryConfig, DevContainerCustomizations, DevContainerVscodeCustomizations } from "./discovery.js";
export { DEFAULT_DEV_CONTAINER_CUSTOMIZATIONS } from "./discovery.js";

// Re-exports from @clawmasons/shared for convenience
export type {
  ResolvedAgent,
  ResolvedRole,
  ResolvedTask,
  ResolvedSkill,
  AgentSkillConfig,
} from "@clawmasons/shared";
export { getAppShortName } from "@clawmasons/shared";
