// Dialect Registry
export {
  registerDialect,
  getDialect,
  getDialectByDirectory,
  getAllDialects,
  getKnownDirectories,
  resolveDialectName,
  type DialectEntry,
  type DialectFieldMapping,
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
