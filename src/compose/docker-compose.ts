import type { ResolvedAgent, ResolvedApp } from "../resolver/types.js";
import type { ComposeServiceDef } from "../materializer/types.js";

/**
 * Collect all unique apps from a resolved agent's roles.
 */
function collectAllApps(agent: ResolvedAgent): Map<string, ResolvedApp> {
  const apps = new Map<string, ResolvedApp>();
  for (const role of agent.roles) {
    for (const app of role.apps) {
      if (!apps.has(app.name)) {
        apps.set(app.name, app);
      }
    }
  }
  return apps;
}

/**
 * Extract environment variable names referenced via ${VAR} interpolation
 * from all app env fields. Returns deduplicated sorted list.
 */
function collectProxyEnvVars(agent: ResolvedAgent): string[] {
  const varNames = new Set<string>();
  const allApps = collectAllApps(agent);

  for (const [, app] of allApps) {
    if (app.env) {
      for (const value of Object.values(app.env)) {
        // Extract ${VAR} references from values
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
 * Indent a string block by a given number of spaces.
 */
function indent(text: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => (line.trim() === "" ? "" : pad + line))
    .join("\n");
}

/**
 * Render a ComposeServiceDef as YAML string (without the service name key).
 */
function renderComposeService(service: ComposeServiceDef): string {
  const lines: string[] = [];

  lines.push(`build: ${service.build}`);
  lines.push(`restart: ${service.restart}`);

  lines.push("volumes:");
  for (const vol of service.volumes) {
    lines.push(`  - ${vol}`);
  }

  lines.push(`working_dir: ${service.working_dir}`);

  lines.push("environment:");
  for (const env of service.environment) {
    lines.push(`  - ${env}`);
  }

  lines.push("depends_on:");
  for (const dep of service.depends_on) {
    lines.push(`  - ${dep}`);
  }

  lines.push(`stdin_open: ${service.stdin_open}`);
  lines.push(`tty: ${service.tty}`);

  lines.push("networks:");
  for (const net of service.networks) {
    lines.push(`  - ${net}`);
  }

  return lines.join("\n");
}

/**
 * Generate a complete docker-compose.yml string from a resolved agent
 * and its runtime compose services.
 *
 * The proxy service runs `forge proxy` natively. Runtime services
 * are rendered from their ComposeServiceDef definitions.
 */
export function generateDockerCompose(
  agent: ResolvedAgent,
  runtimeServices: Map<string, ComposeServiceDef>,
): string {
  const port = agent.proxy?.port ?? 9090;
  const envVars = collectProxyEnvVars(agent);

  const lines: string[] = [];

  lines.push("services:");
  lines.push("");

  // forge proxy service (service name kept as mcp-proxy for depends_on compatibility)
  lines.push("  mcp-proxy:");
  lines.push("    build: ./forge-proxy");
  lines.push("    restart: unless-stopped");
  lines.push("    ports:");
  lines.push(`      - "\${FORGE_PROXY_PORT:-${port}}:${port}"`);
  lines.push("    volumes:");
  lines.push("      - ./forge-proxy/logs:/logs");
  lines.push("      - ./data:/home/node/data");

  lines.push("    environment:");
  lines.push("      - FORGE_DB_PATH=/home/node/data/forge.db");
  lines.push("      - FORGE_PROXY_TOKEN=${FORGE_PROXY_TOKEN}");
  for (const varName of envVars) {
    lines.push(`      - ${varName}=\${${varName}}`);
  }

  lines.push("    logging:");
  lines.push("      driver: json-file");
  lines.push("      options:");
  lines.push('        max-size: "10m"');
  lines.push('        max-file: "5"');
  lines.push("    networks:");
  lines.push("      - agent-net");

  // Runtime services
  for (const [name, service] of runtimeServices) {
    lines.push("");
    lines.push(`  ${name}:`);
    lines.push(indent(renderComposeService(service), 4));
  }

  // Networks
  lines.push("");
  lines.push("networks:");
  lines.push("  agent-net:");
  lines.push("    driver: bridge");

  return lines.join("\n");
}
