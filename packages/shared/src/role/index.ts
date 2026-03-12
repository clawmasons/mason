// Dialect Registry
export {
  registerDialect,
  getDialect,
  getDialectByDirectory,
  getAllDialects,
  getKnownDirectories,
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
export { readPackagedRole, PackageReadError } from "./package-reader.js";
