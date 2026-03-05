import { readFileSync, existsSync } from "node:fs";

/**
 * Parse a .env file into a key-value record.
 *
 * Handles:
 * - KEY=VALUE lines
 * - Blank lines and comments (lines starting with #)
 * - Single-quoted, double-quoted, and unquoted values
 * - Inline comments after unquoted values
 */
export function loadEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) {
    return {};
  }

  const content = readFileSync(filePath, "utf-8");
  const result: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    // Skip blank lines and comments
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    if (!key) continue;

    let value = trimmed.slice(eqIndex + 1).trim();

    // Handle quoted values
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      // Strip inline comments for unquoted values
      const commentIndex = value.indexOf(" #");
      if (commentIndex !== -1) {
        value = value.slice(0, commentIndex).trim();
      }
    }

    result[key] = value;
  }

  return result;
}

/**
 * Resolve `${VAR}` references in an env record.
 *
 * Resolution order:
 * 1. process.env (allows runtime overrides)
 * 2. Loaded .env values
 *
 * Unresolved references are left as empty strings.
 */
export function resolveEnvVars(
  env: Record<string, string>,
  loaded: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(env)) {
    result[key] = value.replace(/\$\{([^}]+)\}/g, (_match, varName: string) => {
      return process.env[varName] ?? loaded[varName] ?? "";
    });
  }

  return result;
}
