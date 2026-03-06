export {
  appChapterFieldSchema,
  type AppChapterField,
  skillChapterFieldSchema,
  type SkillChapterField,
  taskChapterFieldSchema,
  type TaskChapterField,
  roleChapterFieldSchema,
  type RoleChapterField,
  memberChapterFieldSchema,
  type MemberChapterField,
  parseChapterField,
  type ChapterField,
} from "./schemas/index.js";

export {
  type DiscoveredPackage,
  type ResolvedMember,
  type ResolvedApp,
  type ResolvedRole,
  type ResolvedSkill,
  type ResolvedTask,
  PackageNotFoundError,
  InvalidChapterFieldError,
  CircularDependencyError,
  TypeMismatchError,
  discoverPackages,
  resolveMember,
} from "./resolver/index.js";

export {
  validateMember,
  type ValidationResult,
  type ValidationError,
  type ValidationErrorCategory,
} from "./validator/index.js";

export {
  computeToolFilters,
  getAppShortName,
  type ToolFilter,
} from "./generator/index.js";

export {
  claudeCodeMaterializer,
  type RuntimeMaterializer,
  type MaterializationResult,
  type ComposeServiceDef,
} from "./materializer/index.js";

export {
  generateDockerCompose,
  generateEnvTemplate,
  generateLockFile,
  type LockFile,
  type LockFileRole,
} from "./compose/index.js";
