import type { ResolvedAgent, ResolvedApp } from "../resolver/types.js";
import { PROVIDER_ENV_VARS } from "../materializer/pi-coding-agent.js";

/** Known runtime → auth variable mappings. */
const RUNTIME_API_KEYS: Record<string, string> = {
  codex: "OPENAI_API_KEY",
};

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
 * Extract ${VAR} interpolation variable names from app env values.
 * Returns deduplicated sorted list.
 */
function collectAppEnvVars(agent: ResolvedAgent): string[] {
  const varNames = new Set<string>();
  const allApps = collectAllApps(agent);

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
export function generateEnvTemplate(agent: ResolvedAgent): string {
  const port = agent.proxy?.port ?? 9090;
  const lines: string[] = [];

  // Proxy section
  lines.push("# Proxy");
  lines.push("CHAPTER_PROXY_TOKEN=");
  lines.push(`CHAPTER_PROXY_PORT=${port}`);

  // App credentials section
  const appVars = collectAppEnvVars(agent);
  lines.push("");
  lines.push("# App Credentials");
  for (const varName of appVars) {
    lines.push(`${varName}=`);
  }

  // Runtime auth section
  const addedAuthVars = new Set<string>();
  lines.push("");
  lines.push("# Runtime Auth");
  for (const runtime of agent.runtimes) {
    const apiKey = RUNTIME_API_KEYS[runtime];
    if (apiKey && !addedAuthVars.has(apiKey)) {
      lines.push(`${apiKey}=`);
      addedAuthVars.add(apiKey);
    }
  }

  // LLM provider API key (from agent.llm.provider)
  if (agent.llm) {
    const llmEnvVar = PROVIDER_ENV_VARS[agent.llm.provider];
    if (llmEnvVar && !addedAuthVars.has(llmEnvVar)) {
      lines.push(`${llmEnvVar}=`);
      addedAuthVars.add(llmEnvVar);
    }
  }

  return lines.join("\n");
}
