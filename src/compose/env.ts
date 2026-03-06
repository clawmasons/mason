import type { ResolvedMember, ResolvedApp } from "../resolver/types.js";

/** Known runtime → auth variable mappings. */
const RUNTIME_API_KEYS: Record<string, string> = {
  codex: "OPENAI_API_KEY",
};

/**
 * Collect all unique apps from a resolved agent's roles.
 */
function collectAllApps(member: ResolvedMember): Map<string, ResolvedApp> {
  const apps = new Map<string, ResolvedApp>();
  for (const role of member.roles) {
    for (const app of role.apps) {
      if (!apps.has(app.name)) {
        apps.set(app.name, app);
      }
    }
  }
  return apps;
}

/**
 * Extract ${VAR} interpolation variable names from app env values.
 * Returns deduplicated sorted list.
 */
function collectAppEnvVars(member: ResolvedMember): string[] {
  const varNames = new Set<string>();
  const allApps = collectAllApps(member);

  for (const [, app] of allApps) {
    if (app.env) {
      for (const value of Object.values(app.env)) {
        const matches = value.matchAll(/\$\{([^}]+)\}/g);
        for (const match of matches) {
          varNames.add(match[1]);
        }
      }
    }
  }

  return [...varNames].sort();
}

/**
 * Generate a .env template string with all required environment variables
 * for the agent stack.
 *
 * Variables are grouped by source:
 * - Proxy (CHAPTER_PROXY_TOKEN, CHAPTER_PROXY_PORT)
 * - App Credentials (from app env fields)
 * - Runtime API Keys (per declared runtime)
 */
export function generateEnvTemplate(member: ResolvedMember): string {
  const port = member.proxy?.port ?? 9090;
  const lines: string[] = [];

  // Proxy section
  lines.push("# Proxy");
  lines.push("CHAPTER_PROXY_TOKEN=");
  lines.push(`CHAPTER_PROXY_PORT=${port}`);

  // App credentials section
  const appVars = collectAppEnvVars(member);
  lines.push("");
  lines.push("# App Credentials");
  for (const varName of appVars) {
    lines.push(`${varName}=`);
  }

  // Runtime auth section
  lines.push("");
  lines.push("# Runtime Auth");
  for (const runtime of member.runtimes) {
    const apiKey = RUNTIME_API_KEYS[runtime];
    if (apiKey) {
      lines.push(`${apiKey}=`);
    }
  }

  return lines.join("\n");
}
