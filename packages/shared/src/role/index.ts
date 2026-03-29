// Dialect Registry
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
} from "./dialect-registry.js";

// Parser
export {
  readMaterializedRole,
  parseFrontmatter,
  detectDialect,
  RoleParseError,
} from "./parser.js";

// Resource Scanner
export { scanBundledResources } from "./resource-scanner.js";

// Package Reader
export {
  readPackagedRole,
  PackageReadError,
  PackageDependencyError,
} from "./package-reader.js";

// Adapter
export { adaptRoleToResolvedAgent, AdapterError } from "./adapter.js";

// Discovery
export { discoverRoles, resolveRole, RoleDiscoveryError } from "./discovery.js";

// Wildcard expansion
export {
  isWildcardPattern,
  validatePattern,
  matchWildcard,
  expandTaskWildcards,
  expandSkillWildcards,
  WildcardPatternError,
} from "./wildcard.js";

// Role field resolution
export { resolveRoleFields } from "./resolve-role-fields.js";
