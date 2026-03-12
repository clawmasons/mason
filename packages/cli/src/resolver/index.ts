export type {
  DiscoveredPackage,
  ResolvedAgent,
  ResolvedApp,
  ResolvedRole,
  ResolvedSkill,
  ResolvedTask,
} from "@clawmasons/shared";

export {
  PackageNotFoundError,
  InvalidChapterFieldError,
  CircularDependencyError,
  TypeMismatchError,
} from "./errors.js";

export { discoverPackages } from "./discover.js";
export { resolveRolePackage } from "./resolve.js";
