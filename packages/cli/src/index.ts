export {
  appChapterFieldSchema,
  type AppChapterField,
  skillChapterFieldSchema,
  type SkillChapterField,
  taskChapterFieldSchema,
  type TaskChapterField,
  roleChapterFieldSchema,
  type RoleChapterField,
  parseChapterField,
  type ChapterField,
  type DiscoveredPackage,
  type ResolvedAgent,
  type ResolvedApp,
  type ResolvedRole,
  type ResolvedSkill,
  type ResolvedTask,
  computeToolFilters,
  getAppShortName,
  type ToolFilter,
} from "@clawmasons/shared";

export {
  PackageNotFoundError,
  InvalidChapterFieldError,
  CircularDependencyError,
  TypeMismatchError,
  discoverPackages,
  resolveRolePackage,
} from "./resolver/index.js";

export {
  validateAgent,
  type ValidationResult,
  type ValidationError,
  type ValidationErrorCategory,
  type ValidationWarning,
  type ValidationWarningCategory,
} from "./validator/index.js";

export {
  claudeCodeMaterializer,
  piCodingAgentMaterializer,
  mcpAgentMaterializer,
  PROVIDER_ENV_VARS,
  ACP_RUNTIME_COMMANDS,
  type RuntimeMaterializer,
  type MaterializationResult,
  type MaterializeOptions,
} from "./materializer/index.js";

// Re-export agent packages for consumers
export { default as claudeCodeAgent } from "@clawmasons/claude-code";
export { default as piCodingAgentPkg } from "@clawmasons/pi-coding-agent";
export type { AgentPackage } from "@clawmasons/agent-sdk";
