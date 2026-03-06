import type { ResolvedAgent } from "../resolver/types.js";
import type { ToolFilter } from "./types.js";

/** Known forge package type prefixes. */
const TYPE_PREFIXES = ["app-", "agent-", "role-", "task-", "skill-"];

/**
 * Extract a short name from a forge package name.
 * Strips the npm scope and any known forge type prefix.
 *
 * Examples:
 *   "@clawmasons/app-github" → "github"
 *   "@clawmasons/agent-repo-ops" → "repo-ops"
 *   "@clawmasons/slack-server" → "slack-server"
 *   "app-github" → "github"
 */
export function getAppShortName(packageName: string): string {
  // Strip scope (e.g., "@clawmasons/app-github" → "app-github")
  const parts = packageName.split("/");
  const unscoped = parts[parts.length - 1] ?? packageName;

  // Strip known type prefix if present
  for (const prefix of TYPE_PREFIXES) {
    if (unscoped.startsWith(prefix)) {
      return unscoped.slice(prefix.length);
    }
  }

  return unscoped;
}

/**
 * Compute per-app toolFilter allow-lists from the union of all role
 * permissions in a resolved agent.
 *
 * For each app referenced by any role, collects all `allow` lists and
 * computes the set union. Returns a Map keyed by full app package name.
 */
export function computeToolFilters(
  agent: ResolvedAgent,
): Map<string, ToolFilter> {
  const toolSets = new Map<string, Set<string>>();

  for (const role of agent.roles) {
    for (const [appName, perms] of Object.entries(role.permissions)) {
      let toolSet = toolSets.get(appName);
      if (!toolSet) {
        toolSet = new Set<string>();
        toolSets.set(appName, toolSet);
      }
      for (const tool of perms.allow) {
        toolSet.add(tool);
      }
    }
  }

  const result = new Map<string, ToolFilter>();
  for (const [appName, toolSet] of toolSets) {
    result.set(appName, {
      mode: "allow",
      list: [...toolSet],
    });
  }

  return result;
}
