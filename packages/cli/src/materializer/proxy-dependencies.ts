/**
 * Generates Docker build context artifacts: `proxy-bundle.cjs` (the esbuild
 * proxy bundle), `proxy-config.json` (pre-resolved MCP server configurations),
 * and `agent-entry.js` (the agent container entrypoint bundle).
 *
 * The proxy container reads `proxy-config.json` at startup instead of
 * performing runtime package discovery — no `node_modules/` needed.
 *
 * @module proxy-dependencies
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { Role } from "@clawmasons/shared";
import type { ProxyConfigFile } from "@clawmasons/shared";
import { getAppShortName } from "@clawmasons/shared";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Root of the @clawmasons/cli package (two levels up from materializer/).
 * Used to locate the pre-built proxy bundle.
 */
const CLI_PACKAGE_ROOT = path.resolve(__dirname, "../..");

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ensure the proxy Docker build context has the proxy bundle and a
 * pre-resolved `proxy-config.json` for the given role.
 *
 * - Copies `proxy-bundle.cjs` to `dockerDir/` (shared across roles, idempotent).
 * - Generates `proxy-config.json` in the role's `mcp-proxy/` subdirectory.
 *
 * Replaces the previous approach of copying `node_modules/` into the build
 * context. The proxy now reads config from JSON instead of scanning the
 * filesystem for packages.
 *
 * @param dockerDir  - The Docker build root directory (`.mason/docker/`).
 * @param role       - The Role to generate proxy config for.
 * @param projectDir - The project root (unused after node_modules removal,
 *                     kept for call-site compatibility).
 */
export function ensureProxyDependencies(
  dockerDir: string,
  role: Role,
): void {
  // 1. Copy proxy bundle (shared, idempotent)
  copyProxyBundle(dockerDir);

  // 2. Generate proxy-config.json for this role
  const roleName = getAppShortName(role.metadata.name);
  const proxyDir = path.join(dockerDir, roleName, "mcp-proxy");
  fs.mkdirSync(proxyDir, { recursive: true });

  const config = generateProxyConfig(role);
  fs.writeFileSync(
    path.join(proxyDir, "proxy-config.json"),
    JSON.stringify(config, null, 2) + "\n",
  );
}

// ---------------------------------------------------------------------------
// Config Generation
// ---------------------------------------------------------------------------

/**
 * Build a `ProxyConfigFile` from a Role definition.
 *
 * Tool filters are computed directly from the role's MCP server permissions.
 * Environment variables in server configs are preserved as `${VAR_NAME}`
 * placeholders — they are resolved at proxy startup from the container env.
 */
function generateProxyConfig(role: Role): ProxyConfigFile {
  // Build tool filters from MCP server permissions
  const toolFilters: Record<string, { mode: "allow"; list: string[] }> = {};
  for (const app of role.mcp) {
    const allowList = app.tools?.allow;
    if (allowList && allowList.length > 0) {
      toolFilters[app.name] = { mode: "allow", list: [...allowList] };
    }
  }

  // Collect approval patterns from constraints
  const approvalPatterns = role.governance?.constraints?.requireApprovalFor
    ? [...role.governance.constraints.requireApprovalFor]
    : [];

  // Build upstream configs — env vars stay as ${VAR} placeholders
  const upstreams = role.mcp.map((server) => ({
    name: server.name,
    server: {
      name: server.name,
      version: "0.0.0",
      transport: server.transport ?? ("stdio" as const),
      command: server.command,
      args: server.args,
      url: server.url,
      env: server.env && Object.keys(server.env).length > 0
        ? server.env
        : undefined,
      tools: [...(server.tools?.allow ?? [])],
      capabilities: ["tools"] as string[],
      credentials: server.credentials?.length ? [...server.credentials] : [],
      location: server.location ?? ("proxy" as const),
    },
  }));

  return {
    role: role.metadata.name,
    toolFilters,
    approvalPatterns,
    upstreams,
  };
}

// ---------------------------------------------------------------------------
// Agent Entry Bundle
// ---------------------------------------------------------------------------

/**
 * Copy the pre-built agent-entry bundle into the Docker build context.
 *
 * Resolved via the `@clawmasons/agent-entry/bin` export — works in both
 * the monorepo (symlinked node_modules) and when published to npm.
 */
export function copyAgentEntryBundle(dockerDir: string): void {
  const bundleName = "agent-entry.js";
  const dest = path.join(dockerDir, bundleName);
  if (fs.existsSync(dest)) return;

  const require = createRequire(import.meta.url);
  let bundleSrc: string;
  try {
    bundleSrc = require.resolve("@clawmasons/agent-entry/bin");
  } catch {
    console.warn(
      "Warning: @clawmasons/agent-entry/bin could not be resolved. " +
      "Run 'npm run build' in @clawmasons/agent-entry to build it.",
    );
    return;
  }

  fs.cpSync(bundleSrc, dest);

  const mapSrc = bundleSrc + ".map";
  if (fs.existsSync(mapSrc)) {
    fs.cpSync(mapSrc, dest + ".map");
  }
}

// ---------------------------------------------------------------------------
// Proxy Bundle Copy
// ---------------------------------------------------------------------------

/**
 * Copy the pre-built proxy bundle into the Docker build context.
 *
 * The bundle is built by `npm run build:proxy` in @clawmasons/mason
 * and lives at `packages/cli/dist/proxy-bundle.cjs`. Inside Docker
 * this replaces the multi-file ESM resolution chain for faster boot.
 */
function copyProxyBundle(dockerDir: string): void {
  const bundleName = "proxy-bundle.cjs";
  const dest = path.join(dockerDir, bundleName);
  if (fs.existsSync(dest)) return;

  // The bundle is in the cli package's dist/ directory
  const bundleSrc = path.resolve(CLI_PACKAGE_ROOT, "dist", bundleName);
  if (!fs.existsSync(bundleSrc)) {
    console.warn(
      `Warning: proxy bundle not found at ${bundleSrc}. ` +
      "Run 'npm run build:proxy' in @clawmasons/mason to build it. " +
      "Falling back to unbundled proxy entrypoint.",
    );
    return;
  }

  fs.cpSync(bundleSrc, dest);

  // Also copy the sourcemap if available
  const mapSrc = bundleSrc + ".map";
  if (fs.existsSync(mapSrc)) {
    fs.cpSync(mapSrc, dest + ".map");
  }
}
