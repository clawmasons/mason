import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ToolFilter } from "../generator/types.js";
import { getAppShortName } from "../generator/toolfilter.js";

// ── Types ──────────────────────────────────────────────────────────────

export interface RouteEntry {
  /** Full package name, e.g., "@clawforge/app-github". */
  appName: string;
  /** Short name derived from package name, e.g., "github". */
  appShortName: string;
  /** Original upstream tool name, e.g., "create_pr". */
  originalToolName: string;
  /** Prefixed tool name exposed downstream, e.g., "github_create_pr". */
  prefixedToolName: string;
  /** MCP Tool object with name rewritten to the prefixed form. */
  tool: Tool;
}

// ── ToolRouter ─────────────────────────────────────────────────────────

export class ToolRouter {
  private routes = new Map<string, RouteEntry>();

  constructor(
    upstreamTools: Map<string, Tool[]>,
    toolFilters: Map<string, ToolFilter>,
  ) {
    for (const [appName, tools] of upstreamTools) {
      const filter = toolFilters.get(appName);
      if (!filter) continue; // No filter entry → exclude all tools from this app

      const allowSet = new Set(filter.list);
      const appShortName = getAppShortName(appName);

      for (const tool of tools) {
        if (!allowSet.has(tool.name)) continue;

        const prefixedToolName = ToolRouter.prefixName(
          appShortName,
          tool.name,
        );

        const existing = this.routes.get(prefixedToolName);
        if (existing) {
          throw new Error(
            `Duplicate prefixed tool name "${prefixedToolName}" from apps "${existing.appName}" and "${appName}"`,
          );
        }

        const prefixedTool: Tool = { ...tool, name: prefixedToolName };

        this.routes.set(prefixedToolName, {
          appName,
          appShortName,
          originalToolName: tool.name,
          prefixedToolName,
          tool: prefixedTool,
        });
      }
    }
  }

  /** Returns all prefixed, filtered MCP Tool objects. */
  listTools(): Tool[] {
    return Array.from(this.routes.values()).map((entry) => entry.tool);
  }

  /** Resolves a prefixed tool name to its route entry, or null if unknown/filtered. */
  resolve(prefixedName: string): RouteEntry | null {
    return this.routes.get(prefixedName) ?? null;
  }

  /** Prefix a tool name with an app short name. */
  static prefixName(appShortName: string, toolName: string): string {
    return `${appShortName}_${toolName}`;
  }

  /** Strip the app short name prefix from a prefixed tool name. */
  static unprefixName(appShortName: string, prefixedName: string): string {
    const prefix = `${appShortName}_`;
    if (prefixedName.startsWith(prefix)) {
      return prefixedName.slice(prefix.length);
    }
    return prefixedName;
  }
}
