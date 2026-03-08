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
  PROVIDER_ENV_VARS,
  type RuntimeMaterializer,
  type MaterializationResult,
} from "./materializer/index.js";
