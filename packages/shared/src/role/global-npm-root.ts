/**
 * Resolve the global node_modules directory via `npm root -g`.
 * Result is cached for the lifetime of the process.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

let cachedResult: string | null | undefined = undefined;

/**
 * Returns the absolute path to the global node_modules directory,
 * or null if it cannot be determined (npm unavailable, command failure, etc.).
 * The result is cached after the first call.
 */
export async function getGlobalNpmRoot(): Promise<string | null> {
  if (cachedResult !== undefined) return cachedResult;

  try {
    const { stdout } = await execAsync("npm root -g");
    const path = stdout.trim();
    cachedResult = path.length > 0 ? path : null;
  } catch {
    cachedResult = null;
  }

  return cachedResult;
}

/** Reset the cache (for testing). */
export function resetGlobalNpmRootCache(): void {
  cachedResult = undefined;
}
