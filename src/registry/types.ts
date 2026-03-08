/**
 * A single agent entry in the agents registry.
 */
export interface AgentEntry {
  /** npm package name, e.g. "@acme/agent-note-taker" */
  package: string;
  /** Operational status */
  status: "enabled" | "disabled";
  /** ISO 8601 timestamp of when the agent was installed or last reinstalled */
  installedAt: string;
}

/**
 * The agents registry stored at `.chapter/agents.json`.
 * Keys are agent slugs.
 */
export interface AgentsRegistry {
  agents: Record<string, AgentEntry>;
}
