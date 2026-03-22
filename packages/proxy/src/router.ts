import type { Tool, Resource, Prompt } from "@modelcontextprotocol/sdk/types.js";
import type { ToolFilter } from "@clawmasons/shared";
import { getAppShortName } from "@clawmasons/shared";

// ── Types ──────────────────────────────────────────────────────────────

export interface RouteEntry {
  /** Full package name, e.g., "@clawmasons/app-github". */
  appName: string;
  /** Short name derived from package name, e.g., "github". */
  appShortName: string;
  /** Original upstream tool name, e.g., "create_pr". */
  originalToolName: string;
  /** Prefixed tool name exposed downstream, e.g., "github_create_pr". */
  prefixedToolName: string;
  /** MCP Tool object with name rewritten to the prefixed form. */
  tool: Tool;
  /** True if this route is for a host MCP server tool (forwarded via relay). */
  isHostRoute?: boolean;
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

  /**
   * Dynamically add routes for host MCP server tools.
   * Called when the relay server receives mcp_tools_register.
   *
   * @param appName - The app name (used for short name derivation via getAppShortName)
   * @param tools - Tool definitions from the host MCP server
   * @throws If any prefixed tool name collides with an existing route
   */
  addRoutes(appName: string, tools: Tool[]): void {
    const appShortName = getAppShortName(appName);

    for (const tool of tools) {
      const prefixedToolName = ToolRouter.prefixName(appShortName, tool.name);

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
        isHostRoute: true,
      });
    }
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

// ── ResourceRouter ──────────────────────────────────────────────────

export interface ResourceRouteEntry {
  appName: string;
  appShortName: string;
  originalName: string;
  prefixedName: string;
  originalUri: string;
  resource: Resource;
}

export class ResourceRouter {
  private entries: ResourceRouteEntry[] = [];
  private uriMap = new Map<string, { appName: string; originalUri: string }>();

  constructor(upstreamResources: Map<string, Resource[]>) {
    for (const [appName, resources] of upstreamResources) {
      const appShortName = getAppShortName(appName);

      for (const resource of resources) {
        const prefixedName = ToolRouter.prefixName(appShortName, resource.name);
        const prefixedResource: Resource = { ...resource, name: prefixedName };

        this.entries.push({
          appName,
          appShortName,
          originalName: resource.name,
          prefixedName,
          originalUri: resource.uri,
          resource: prefixedResource,
        });

        // Map URI → app for read routing (first app wins on collision)
        if (!this.uriMap.has(resource.uri)) {
          this.uriMap.set(resource.uri, { appName, originalUri: resource.uri });
        }
      }
    }
  }

  /** Returns all prefixed MCP Resource objects. */
  listResources(): Resource[] {
    return this.entries.map((e) => e.resource);
  }

  /** Resolves a resource URI to its upstream app and original URI, or null if unknown. */
  resolveUri(uri: string): { appName: string; originalUri: string } | null {
    return this.uriMap.get(uri) ?? null;
  }
}

// ── PromptRouter ────────────────────────────────────────────────────

export interface PromptRouteEntry {
  appName: string;
  appShortName: string;
  originalName: string;
  prefixedName: string;
  prompt: Prompt;
}

export class PromptRouter {
  private routes = new Map<string, PromptRouteEntry>();

  constructor(upstreamPrompts: Map<string, Prompt[]>) {
    for (const [appName, prompts] of upstreamPrompts) {
      const appShortName = getAppShortName(appName);

      for (const prompt of prompts) {
        const prefixedName = ToolRouter.prefixName(appShortName, prompt.name);
        const prefixedPrompt: Prompt = { ...prompt, name: prefixedName };

        this.routes.set(prefixedName, {
          appName,
          appShortName,
          originalName: prompt.name,
          prefixedName,
          prompt: prefixedPrompt,
        });
      }
    }
  }

  /** Returns all prefixed MCP Prompt objects. */
  listPrompts(): Prompt[] {
    return Array.from(this.routes.values()).map((e) => e.prompt);
  }

  /** Resolves a prefixed prompt name to its route entry, or null if unknown. */
  resolve(prefixedName: string): PromptRouteEntry | null {
    return this.routes.get(prefixedName) ?? null;
  }
}
