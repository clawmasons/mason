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
  agentChapterFieldSchema,
  type AgentChapterField,
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
  roleTypeSchema,
} from "./schemas/index.js";

// ROLE_TYPES types
export type {
  RoleType,
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
} from "./types/role-types.js";

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
  adaptRoleToResolvedAgent,
  AdapterError,
  discoverRoles,
  resolveRole,
  RoleDiscoveryError,
} from "./role/index.js";
