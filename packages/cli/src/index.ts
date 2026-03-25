export {
  appFieldSchema,
  type AppField,
  skillFieldSchema,
  type SkillField,
  taskFieldSchema,
  type TaskField,
  roleFieldSchema,
  type RoleField,
  parseField,
  type Field,
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
  InvalidFieldError,
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
  mcpAgentMaterializer,
  PROVIDER_ENV_VARS,
  ACP_RUNTIME_COMMANDS,
  type RuntimeMaterializer,
  type MaterializationResult,
  type MaterializeOptions,
} from "./materializer/index.js";

export type { AgentPackage } from "@clawmasons/agent-sdk";
