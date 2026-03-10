export {
  appChapterFieldSchema,
  type AppChapterField,
  skillChapterFieldSchema,
  type SkillChapterField,
  taskChapterFieldSchema,
  type TaskChapterField,
  roleChapterFieldSchema,
  type RoleChapterField,
  agentChapterFieldSchema,
  type AgentChapterField,
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
  resolveAgent,
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
