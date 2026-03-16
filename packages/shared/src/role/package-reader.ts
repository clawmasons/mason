/**
 * Package Reader — reads an NPM role package and produces a Role object.
 *
 * Steps:
 * 1. Read package.json and verify chapter.type === "role"
 * 2. Read the bundled ROLE.md from the package directory
 * 3. Parse frontmatter and body (reuses parseFrontmatter from parser.ts)
 * 4. Normalize fields using dialect mapping if chapter.dialect is specified,
 *    otherwise use generic ROLE_TYPES field names directly
 * 5. Resolve all paths relative to the package directory
 * 6. Set source.type = 'package' and source.packageName
 * 7. Validate through roleSchema
 */

import { readFile } from "node:fs/promises";
import { join, basename, resolve } from "node:path";
import { roleSchema } from "../schemas/role-types.js";
import type { Role } from "../types/role.js";
import { parseFrontmatter } from "./parser.js";
import { scanBundledResources } from "./resource-scanner.js";
import { getDialect, type DialectEntry } from "./dialect-registry.js";

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
 * The subset of package.json fields we need.
 */
interface PackageJson {
  name: string;
  version?: string;
  chapter?: {
    type?: string;
    dialect?: string;
  };
}

/**
 * Generic field mapping — packaged roles use ROLE_TYPES generic names directly.
 */
const GENERIC_FIELD_MAPPING: DialectEntry = {
  name: "generic",
  directory: "",
  fieldMapping: {
    tasks: "tasks",
    apps: "apps",
    skills: "skills",
  },
};

/**
 * Read an NPM role package and produce a validated Role object.
 *
 * @param packagePath - Absolute path to the package directory (e.g., node_modules/@acme/role-create-prd)
 * @returns Validated Role with source.type = 'package'
 * @throws PackageReadError if the package is missing required files or has wrong chapter.type
 */
export async function readPackagedRole(packagePath: string): Promise<Role> {
  // 1. Read and validate package.json
  const pkgJson = await readPackageJson(packagePath);

  if (!pkgJson.chapter || pkgJson.chapter.type !== "role") {
    throw new PackageReadError(
      `Package "${pkgJson.name}" does not have chapter.type = "role" (got: ${pkgJson.chapter?.type ?? "undefined"})`,
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
  const apps = normalizeApps(frontmatter, dialect.fieldMapping.apps);
  const skills = normalizeSkills(
    frontmatter,
    dialect.fieldMapping.skills,
    packagePath,
  );

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
    tasks,
    apps,
    skills,
    container,
    governance,
    resources,
    source: {
      type: "package" as const,
      packageName: pkgJson.name,
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
 * If chapter.dialect is specified, use that dialect's mapping.
 * Otherwise, use generic ROLE_TYPES field names.
 */
function resolveDialect(
  pkgJson: PackageJson,
  packagePath: string,
): DialectEntry {
  const dialectName = pkgJson.chapter?.dialect;
  if (!dialectName) return GENERIC_FIELD_MAPPING;

  const dialect = getDialect(dialectName);
  if (!dialect) {
    throw new PackageReadError(
      `Unknown dialect "${dialectName}" specified in chapter.dialect`,
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
 * Normalize apps field.
 */
function normalizeApps(
  frontmatter: Record<string, unknown>,
  fieldName: string,
): Array<Record<string, unknown>> {
  const raw = frontmatter[fieldName];
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
