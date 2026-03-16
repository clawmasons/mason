/**
 * Resource Scanner — discover bundled resources in a role directory.
 *
 * Recursively walks the role directory and returns ResourceFile entries for
 * all files except ROLE.md itself. Only paths are stored — file content is
 * never loaded into memory (per PRD §5.1).
 */

import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type { ResourceFile } from "../types/role.js";

/**
 * Recursively scan a role directory for bundled resources.
 *
 * @param roleDir - Absolute path to the role directory (contains ROLE.md)
 * @returns Array of ResourceFile entries with relative and absolute paths
 */
export async function scanBundledResources(roleDir: string): Promise<ResourceFile[]> {
  const resources: ResourceFile[] = [];
  await walkDirectory(roleDir, roleDir, resources);
  return resources;
}

async function walkDirectory(
  baseDir: string,
  currentDir: string,
  results: ResourceFile[],
): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = join(currentDir, entry.name);
    const relativePath = relative(baseDir, absolutePath);

    if (entry.isDirectory()) {
      await walkDirectory(baseDir, absolutePath, results);
    } else if (entry.isFile()) {
      // Skip ROLE.md itself
      if (entry.name === "ROLE.md" && currentDir === baseDir) {
        continue;
      }

      const fileStat = await stat(absolutePath);
      results.push({
        relativePath,
        absolutePath,
        permissions: fileStat.mode,
      });
    }
  }
}
