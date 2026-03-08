import * as fs from "node:fs";
import * as path from "node:path";
import type { AgentEntry, AgentsRegistry } from "./types.js";

const REGISTRY_FILENAME = "agents.json";

/**
 * Read the agents registry from `.chapter/agents.json`.
 * Returns an empty registry if the file does not exist.
 */
export function readAgentsRegistry(chapterDir: string): AgentsRegistry {
  const filePath = path.join(chapterDir, REGISTRY_FILENAME);
  if (!fs.existsSync(filePath)) {
    return { agents: {} };
  }
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content) as AgentsRegistry;
}

/**
 * Write the agents registry to `.chapter/agents.json`.
 * Creates the directory if it does not exist.
 */
export function writeAgentsRegistry(chapterDir: string, registry: AgentsRegistry): void {
  fs.mkdirSync(chapterDir, { recursive: true });
  const filePath = path.join(chapterDir, REGISTRY_FILENAME);
  fs.writeFileSync(filePath, JSON.stringify(registry, null, 2) + "\n");
}

/**
 * Add or update an agent entry in the registry.
 * If an agent with the same slug already exists, the entry is fully replaced.
 */
export function addAgent(chapterDir: string, slug: string, entry: AgentEntry): void {
  const registry = readAgentsRegistry(chapterDir);
  registry.agents[slug] = entry;
  writeAgentsRegistry(chapterDir, registry);
}

/**
 * Update an agent's operational status (enabled/disabled).
 * Throws if the agent slug is not found in the registry.
 */
export function updateAgentStatus(
  chapterDir: string,
  slug: string,
  status: "enabled" | "disabled",
): void {
  const registry = readAgentsRegistry(chapterDir);
  const agent = registry.agents[slug];
  if (!agent) {
    throw new Error(`Agent "${slug}" not found in registry`);
  }
  agent.status = status;
  writeAgentsRegistry(chapterDir, registry);
}

/**
 * Get an agent entry by slug.
 * Returns undefined if the agent is not in the registry.
 */
export function getAgent(chapterDir: string, slug: string): AgentEntry | undefined {
  const registry = readAgentsRegistry(chapterDir);
  return registry.agents[slug];
}
