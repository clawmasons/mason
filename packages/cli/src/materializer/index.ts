export { mcpAgentMaterializer } from "@clawmasons/mcp-agent/agent-package";
export { PROVIDER_ENV_VARS, ACP_RUNTIME_COMMANDS } from "./common.js";
export {
  materializeForAgent,
  getMaterializer,
  getRegisteredAgentTypes,
  MaterializerError,
} from "./role-materializer.js";
export type {
  RuntimeMaterializer,
  MaterializationResult,
  MaterializeOptions,
} from "./types.js";
export {
  generateVolumeMasks,
  sanitizeVolumeName,
  ensureSentinelFile,
  generateRoleDockerBuildDir,
  generateSessionComposeYml,
  createSessionDirectory,
} from "./docker-generator.js";
export type {
  VolumeMaskEntry,
  GenerateBuildDirOptions,
  BuildDirResult,
  SessionComposeOptions,
  CreateSessionOptions,
  SessionResult,
} from "./docker-generator.js";
