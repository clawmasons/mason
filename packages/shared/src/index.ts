// Schemas
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
  getDialect,
  getDialectByDirectory,
  getAllDialects,
  getKnownDirectories,
  type DialectEntry,
  type DialectFieldMapping,
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
  type DiscoveredSkill,
  type DiscoveredCommand,
  type DiscoveredMcpServer,
  proposeRoleMd,
  type ProposeOptions,
} from "./mason/index.js";
