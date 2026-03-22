// Constants
export {
  CLI_NAME_LOWERCASE,
  CLI_NAME_DISPLAY,
  CLI_NAME_UPPERCASE,
} from "./constants.js";

// Schemas
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
} from "./schemas/index.js";

// ROLE_TYPES schemas
export {
  toolPermissionsSchema,
  roleMetadataSchema,
  taskRefSchema,
  skillRefSchema,
  appConfigSchema,
  mountConfigSchema,
  containerRequirementsSchema,
  governanceConfigSchema,
  resourceFileSchema,
  roleSourceSchema,
  roleSchema,
} from "./schemas/index.js";

// ROLE_TYPES types
export type {
  Role,
  RoleMetadata,
  TaskRef,
  AppConfig,
  SkillRef,
  ContainerRequirements,
  GovernanceConfig,
  ResourceFile,
  RoleSource,
  MountConfig,
  ToolPermissions,
} from "./types/role.js";

// Resolved types
export type {
  DiscoveredPackage,
  ResolvedAgent,
  ResolvedApp,
  ResolvedRole,
  ResolvedSkill,
  ResolvedTask,
  AgentSkillConfig,
  AgentTaskConfig,
} from "./types.js";

// Tool filtering
export {
  computeToolFilters,
  getAppShortName,
  type ToolFilter,
} from "./toolfilter.js";

// Role module (dialect registry, parser, resource scanner)
export {
  registerDialect,
  registerAgentDialect,
  getDialect,
  getDialectByDirectory,
  getAllDialects,
  getKnownDirectories,
  resolveDialectName,
  type DialectEntry,
  type DialectFieldMapping,
  type AgentDialectInfo,
  readMaterializedRole,
  parseFrontmatter,
  detectDialect,
  RoleParseError,
  scanBundledResources,
  readPackagedRole,
  PackageReadError,
  PackageDependencyError,
  adaptRoleToResolvedAgent,
  AdapterError,
  discoverRoles,
  resolveRole,
  RoleDiscoveryError,
} from "./role/index.js";

// Mason module (project scanner, ROLE.md proposer)
export {
  scanProject,
  type ScanResult,
  type ScanOptions,
  type DiscoveredSkill,
  type DiscoveredCommand,
  type DiscoveredMcpServer,
  proposeRoleMd,
  type ProposeOptions,
} from "./mason/index.js";
