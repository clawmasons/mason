export type {
  DiscoveredPackage,
  ResolvedAgent,
  ResolvedMcpServer,
  ResolvedRole,
  ResolvedSkill,
  ResolvedTask,
} from "@clawmasons/shared";

export {
  PackageNotFoundError,
  InvalidFieldError,
  CircularDependencyError,
  TypeMismatchError,
} from "./errors.js";

export { discoverPackages } from "./discover.js";
export { resolveRolePackage } from "./resolve.js";
