/**
 * Package Reader — reads an NPM role package and produces a Role object.
 *
 * Steps:
 * 1. Read package.json and verify the metadata field has type === "role"
 * 2. Read the bundled ROLE.md from the package directory
 * 3. Parse frontmatter and body (reuses parseFrontmatter from parser.ts)
 * 4. Normalize fields using dialect mapping if metadata.dialect is specified,
 *    otherwise use generic ROLE_TYPES field names directly
 * 5. Resolve all paths relative to the package directory
 * 6. Set source.type = 'package' and source.packageName
 * 7. Validate through roleSchema
 */

import { readFile, stat } from "node:fs/promises";
import { join, basename, resolve } from "node:path";
import { roleSchema } from "../schemas/role-types.js";
import type { Role } from "../types/role.js";
import { parseFrontmatter } from "./parser.js";
import { scanBundledResources } from "./resource-scanner.js";
import { getDialect, type DialectEntry } from "./dialect-registry.js";
import { CLI_NAME_LOWERCASE } from "../constants.js";

/**
 * Error thrown when a role NPM package cannot be read.
 */
export class PackageReadError extends Error {
  constructor(
    message: string,
    public readonly packagePath: string,
  ) {
    super(`${message} (at ${packagePath})`);
    this.name = "PackageReadError";
  }
}

/**
 * Error thrown when a role package is missing bundled dependency subdirectories.
 * All missing paths are collected before throwing (never fail-fast).
 */
export class PackageDependencyError extends Error {
  constructor(
    public readonly roleMdPath: string,
    public readonly missingPaths: string[],
  ) {
    super(
      `Role at ${roleMdPath} has missing dependencies:\n${missingPaths.map((p) => `  - ${p}`).join("\n")}`,
    );
    this.name = "PackageDependencyError";
  }
}

/**
 * The subset of package.json fields we need.
 */
interface PackageJson {
  name: string;
  version?: string;
  [key: string]: unknown;
}

/**
 * Generic field mapping — packaged roles use ROLE_TYPES generic names directly.
 */
const GENERIC_FIELD_MAPPING: DialectEntry = {
  name: "generic",
  directory: "",
  fieldMapping: {
    tasks: "tasks",
    mcp: "mcp",
    skills: "skills",
  },
};

/**
 * Read an NPM role package and produce a validated Role object.
 *
 * @param packagePath - Absolute path to the package directory (e.g., node_modules/@acme/role-create-prd)
 * @returns Validated Role with source.type = 'package'
 * @throws PackageReadError if the package is missing required files or has wrong metadata type
 */
export async function readPackagedRole(packagePath: string): Promise<Role> {
  // 1. Read and validate package.json
  const pkgJson = await readPackageJson(packagePath);
  const metadataField = pkgJson[CLI_NAME_LOWERCASE] as { type?: string; dialect?: string } | undefined;

  if (!metadataField || metadataField.type !== "role") {
    throw new PackageReadError(
      `Package "${pkgJson.name}" does not have ${CLI_NAME_LOWERCASE}.type = "role" (got: ${metadataField?.type ?? "undefined"})`,
      packagePath,
    );
  }

  // 2. Read ROLE.md
  const roleMdPath = join(packagePath, "ROLE.md");
  let roleMdContent: string;
  try {
    roleMdContent = await readFile(roleMdPath, "utf-8");
  } catch {
    throw new PackageReadError(
      `Package "${pkgJson.name}" is missing ROLE.md`,
      packagePath,
    );
  }

  // 3. Parse frontmatter and body
  const { frontmatter, body } = parseFrontmatter(roleMdContent, roleMdPath);

  // 4. Determine field mapping
  const dialect = resolveDialect(pkgJson, packagePath);

  // 5. Extract metadata
  const roleName =
    (frontmatter.name as string | undefined) ?? pkgJson.name;
  const metadata = {
    name: roleName,
    description: frontmatter.description as string | undefined,
    version:
      (frontmatter.version as string | undefined) ?? pkgJson.version,
    scope: frontmatter.scope as string | undefined,
  };

  if (!metadata.description) {
    throw new PackageReadError(
      `Package "${pkgJson.name}" ROLE.md is missing required field: description`,
      packagePath,
    );
  }

  // 6. Normalize fields using dialect mapping
  const tasks = normalizeField(frontmatter, dialect.fieldMapping.tasks);
  const mcp = normalizeMcp(frontmatter, dialect);
  const skills = normalizeSkills(
    frontmatter,
    dialect.fieldMapping.skills,
    packagePath,
  );

  // 6a. Validate bundled dependency subdirectories
  await validateBundledDependencies(roleMdPath, packagePath, skills);

  // 7. Container requirements (pass-through)
  const container = frontmatter.container ?? {};

  // 8. Governance (assembled from top-level fields)
  const governance: Record<string, unknown> = {};
  if (frontmatter.risk !== undefined) governance.risk = frontmatter.risk;
  if (frontmatter.credentials !== undefined)
    governance.credentials = frontmatter.credentials;
  if (frontmatter.constraints !== undefined)
    governance.constraints = frontmatter.constraints;

  // 9. Scan bundled resources
  const resources = await scanBundledResources(packagePath);

  // 10. Build and validate
  const roleData = {
    metadata,
    instructions: body,
    type: frontmatter.type as string | undefined,
    tasks,
    mcp,
    skills,
    container,
    governance,
    resources,
    source: {
      type: "package" as const,
      packageName: pkgJson.name,
      path: packagePath,
    },
  };

  return roleSchema.parse(roleData);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read and parse package.json from a package directory.
 */
async function readPackageJson(packagePath: string): Promise<PackageJson> {
  const pkgJsonPath = join(packagePath, "package.json");
  let raw: string;
  try {
    raw = await readFile(pkgJsonPath, "utf-8");
  } catch {
    throw new PackageReadError(
      "Missing package.json",
      packagePath,
    );
  }

  try {
    const parsed = JSON.parse(raw) as PackageJson;
    if (!parsed.name) {
      throw new PackageReadError(
        "package.json is missing required field: name",
        packagePath,
      );
    }
    return parsed;
  } catch (err) {
    if (err instanceof PackageReadError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new PackageReadError(
      `Invalid package.json: ${msg}`,
      packagePath,
    );
  }
}

/**
 * Resolve the dialect to use for field normalization.
 * If metadata.dialect is specified, use that dialect's mapping.
 * Otherwise, use generic ROLE_TYPES field names.
 */
function resolveDialect(
  pkgJson: PackageJson,
  packagePath: string,
): DialectEntry {
  const metadataField = pkgJson[CLI_NAME_LOWERCASE] as { dialect?: string } | undefined;
  const dialectName = metadataField?.dialect;
  if (!dialectName) return GENERIC_FIELD_MAPPING;

  const dialect = getDialect(dialectName);
  if (!dialect) {
    throw new PackageReadError(
      `Unknown dialect "${dialectName}" specified in ${CLI_NAME_LOWERCASE}.dialect`,
      packagePath,
    );
  }
  return dialect;
}

/**
 * Normalize a simple list field (tasks).
 */
function normalizeField(
  frontmatter: Record<string, unknown>,
  fieldName: string,
): Array<Record<string, unknown>> {
  const raw = frontmatter[fieldName];
  if (!raw) return [];

  if (!Array.isArray(raw)) {
    return [{ name: String(raw) }];
  }

  return raw.map((item: unknown) => {
    if (typeof item === "string") {
      return { name: item };
    }
    if (typeof item === "object" && item !== null && "name" in item) {
      return item as Record<string, unknown>;
    }
    return { name: String(item) };
  });
}

/**
 * Normalize MCP servers field.
 */
function normalizeMcp(
  frontmatter: Record<string, unknown>,
  dialect: DialectEntry,
): Array<Record<string, unknown>> {
  const fieldName = dialect.fieldMapping.mcp;
  let raw = frontmatter[fieldName];

  // Backwards compat: accept old "mcp_servers" field
  if (!raw && fieldName !== "mcp_servers" && frontmatter["mcp_servers"]) {
    raw = frontmatter["mcp_servers"];
  }

  if (!raw) return [];
  if (!Array.isArray(raw)) return [];

  return raw.map((item: unknown) => {
    if (typeof item === "object" && item !== null) {
      return item as Record<string, unknown>;
    }
    return { name: String(item) };
  });
}

/**
 * Normalize skills field with path resolution relative to package directory.
 */
function normalizeSkills(
  frontmatter: Record<string, unknown>,
  fieldName: string,
  packageDir: string,
): Array<Record<string, unknown>> {
  const raw = frontmatter[fieldName];
  if (!raw) return [];
  if (!Array.isArray(raw)) return [];

  return raw.map((item: unknown) => {
    if (typeof item === "string") {
      // Local path reference — resolve relative to package directory
      if (item.startsWith("./") || item.startsWith("../")) {
        const resolvedPath = resolve(packageDir, item);
        const name = basename(resolvedPath);
        return { name, ref: resolvedPath };
      }
      // Package reference — extract short name
      const name = item.startsWith("@")
        ? item.split("/").pop() ?? item
        : item;
      return { name, ref: item };
    }
    if (typeof item === "object" && item !== null && "name" in item) {
      return item as Record<string, unknown>;
    }
    return { name: String(item) };
  });
}

/**
 * Validate that all bundled skill subdirectories referenced in the role exist
 * within the package. Collects ALL missing paths before throwing.
 *
 * A skill is a bundled dep if its `ref` is not an absolute path (not resolved
 * from `./` or `../`) and not a scoped package name (doesn't start with `@`).
 * Tasks are descriptive items, not package dependencies, so they are not checked.
 */
async function validateBundledDependencies(
  roleMdPath: string,
  packagePath: string,
  skills: Array<Record<string, unknown>>,
): Promise<void> {
  const missing: string[] = [];

  for (const skill of skills) {
    const ref = skill.ref as string | undefined;
    if (!ref) continue;
    // Skip already-resolved absolute paths (came from ./ or ../ refs)
    if (ref.startsWith("/")) continue;
    // Skip scoped package references (@org/name)
    if (ref.startsWith("@")) continue;
    const expectedPath = join(packagePath, "skills", ref);
    const exists = await directoryExists(expectedPath);
    if (!exists) missing.push(expectedPath);
  }

  if (missing.length > 0) {
    throw new PackageDependencyError(roleMdPath, missing);
  }
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}
