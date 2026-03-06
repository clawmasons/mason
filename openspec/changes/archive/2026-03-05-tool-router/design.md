## Architecture

One new module: `src/proxy/router.ts`. No changes to existing modules.

### Types

```typescript
interface RouteEntry {
  appName: string;         // Full package name, e.g., "@clawmasons/app-github"
  appShortName: string;    // e.g., "github"
  originalToolName: string; // e.g., "create_pr"
  prefixedToolName: string; // e.g., "github_create_pr"
  tool: Tool;              // MCP Tool object with name rewritten to prefixed form
}
```

### Class: ToolRouter

A stateless routing table built from upstream tools and role-based tool filters. Once constructed, the router is immutable — `listTools()` and `resolve()` are pure lookups.

#### Constructor

```typescript
constructor(
  upstreamTools: Map<string, Tool[]>,   // appName → Tool[]
  toolFilters: Map<string, ToolFilter>, // appName → { mode: "allow", list: string[] }
)
```

1. Iterates each app's tools from `upstreamTools`
2. For each app, derives `appShortName` via `getAppShortName(appName)`
3. For each tool, checks if it's in the app's allow-list (from `toolFilters`)
4. If allowed: creates a `RouteEntry` with `prefixedToolName = appShortName + "_" + originalToolName`
5. Creates a cloned MCP `Tool` object with `name` set to the prefixed name
6. Stores the entry in an internal `Map<prefixedName, RouteEntry>`

#### API Surface

```typescript
class ToolRouter {
  constructor(upstreamTools: Map<string, Tool[]>, toolFilters: Map<string, ToolFilter>);

  /** Returns all prefixed, filtered MCP Tool objects. */
  listTools(): Tool[];

  /** Resolves a prefixed tool name to its route entry, or null if unknown/filtered. */
  resolve(prefixedName: string): RouteEntry | null;

  /** Prefix a tool name with an app short name. */
  static prefixName(appShortName: string, toolName: string): string;

  /** Strip the app short name prefix from a prefixed tool name. */
  static unprefixName(appShortName: string, prefixedName: string): string;
}
```

### Filtering Logic

- If `toolFilters` has an entry for an app, only tools whose `name` appears in `filter.list` are included
- If `toolFilters` has no entry for an app, ALL tools from that app are excluded (no implicit allow)
- The `deny` list is not used by the router — `computeToolFilters()` already computes the union of allows

### Edge Cases

- **Duplicate prefixed names**: If two apps produce the same prefixed name (unlikely but possible), the constructor throws an error
- **Empty tool list**: An app with no allowed tools simply contributes no entries to the routing table
- **App with no filter entry**: All tools from that app are excluded

## Decisions

1. **Stateless after construction**: The router is built once from upstream tools and filters. No mutation after construction. This makes it safe to use concurrently and easy to test.
2. **Tool object cloning**: The MCP `Tool` object is shallow-cloned with only the `name` field changed. Description, inputSchema, annotations, etc. are preserved as-is.
3. **Static prefix/unprefix helpers**: Useful for other modules (server, hooks) that need to work with prefixed names without a full router instance.
4. **No filter entry = excluded**: This is a safe default — if an app has no role permissions at all, none of its tools should be exposed.
5. **Reuses `getAppShortName()`**: The same function used by proxy config generation, ensuring consistent naming between the old external proxy config and the new native proxy.
