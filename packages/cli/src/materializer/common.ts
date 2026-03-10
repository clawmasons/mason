import type { ResolvedAgent, ResolvedRole, ResolvedTask, ResolvedSkill } from "@clawmasons/shared";
import { getAppShortName } from "@clawmasons/shared";

/**
 * Mapping from LLM provider identifiers to their environment variable names.
 *
 * Used by Dockerfile generators to inject the correct API key into
 * Docker Compose services, and by env template generation to include
 * the key in .env.example.
 *
 * @see PRD §3.3 — Supported Providers
 * @see PRD §7.2 — Provider → Environment Variable Mapping
 */
export const PROVIDER_ENV_VARS: Record<string, string> = {
  "openrouter": "OPENROUTER_API_KEY",
  "anthropic": "ANTHROPIC_API_KEY",
  "openai": "OPENAI_API_KEY",
  "google": "GEMINI_API_KEY",
  "mistral": "MISTRAL_API_KEY",
  "groq": "GROQ_API_KEY",
  "xai": "XAI_API_KEY",
  "azure-openai": "AZURE_OPENAI_API_KEY",
};

/**
 * Mapping from runtime identifiers to their ACP agent commands.
 *
 * Used by materializers (to generate .chapter/acp.json) and by
 * Dockerfile generators (to set ACP mode entrypoints).
 *
 * @see PRD §7.6 — Agent Schema Extension
 */
export const ACP_RUNTIME_COMMANDS: Record<string, string> = {
  "claude-code": "claude-agent-acp",
  "pi-coding-agent": "pi-agent-acp",
  "node": "node src/index.js --acp",
};

/**
 * Generate .chapter/acp.json content for ACP agent mode.
 *
 * Contains the ACP port and command so the container entrypoint
 * knows how to start the agent in ACP mode.
 */
export function generateAcpConfigJson(
  acpPort: number,
  acpCommand: string,
): string {
  return JSON.stringify({ port: acpPort, command: acpCommand }, null, 2);
}

/**
 * Format a role's permitted tools as a readable list.
 * Each line: "  - {appShortName}: tool1, tool2, tool3"
 */
export function formatPermittedTools(
  permissions: Record<string, { allow: string[]; deny: string[] }>,
): string {
  const lines: string[] = [];
  for (const [appName, perms] of Object.entries(permissions)) {
    const shortName = getAppShortName(appName);
    lines.push(`  - ${shortName}: ${perms.allow.join(", ")}`);
  }
  return lines.join("\n");
}

/**
 * Find which roles contain a given task (by name).
 */
export function findRolesForTask(
  taskName: string,
  roles: ResolvedRole[],
): ResolvedRole[] {
  return roles.filter((role) =>
    role.tasks.some((t) => t.name === taskName),
  );
}

/**
 * Collect all unique skills across all roles.
 */
export function collectAllSkills(roles: ResolvedRole[]): Map<string, ResolvedSkill> {
  const skills = new Map<string, ResolvedSkill>();

  for (const role of roles) {
    for (const skill of role.skills) {
      if (!skills.has(skill.name)) {
        skills.set(skill.name, skill);
      }
    }
    for (const task of role.tasks) {
      for (const skill of task.skills) {
        if (!skills.has(skill.name)) {
          skills.set(skill.name, skill);
        }
      }
    }
  }

  return skills;
}

/**
 * Collect all unique tasks across all roles.
 * Returns tuples of [task, owningRoles].
 */
export function collectAllTasks(
  roles: ResolvedRole[],
): Array<[ResolvedTask, ResolvedRole[]]> {
  const seen = new Set<string>();
  const result: Array<[ResolvedTask, ResolvedRole[]]> = [];

  for (const role of roles) {
    for (const task of role.tasks) {
      if (!seen.has(task.name)) {
        seen.add(task.name);
        const owningRoles = findRolesForTask(task.name, roles);
        result.push([task, owningRoles]);
      }
    }
  }

  return result;
}

/**
 * Generate AGENTS.md content.
 */
export function generateAgentsMd(agent: ResolvedAgent): string {
  const agentShortName = getAppShortName(agent.name);
  const lines: string[] = [];

  lines.push(`# Agent: ${agentShortName}`);
  lines.push("");
  lines.push("You are an agent managed by chapter (Clawmasons Chapter).");
  lines.push("You have multiple roles. Each task you execute specifies which");
  lines.push("role is active. Only use tools permitted by the active role.");
  lines.push("");
  lines.push("## Roles");

  for (const role of agent.roles) {
    const roleShortName = getAppShortName(role.name);
    lines.push("");
    lines.push(`### ${roleShortName}`);
    if (role.description) {
      lines.push(role.description);
    }
    lines.push("");
    lines.push("**Permitted tools:**");
    lines.push(formatPermittedTools(role.permissions));

    if (role.constraints) {
      const hasConstraints =
        role.constraints.maxConcurrentTasks !== undefined ||
        (role.constraints.requireApprovalFor && role.constraints.requireApprovalFor.length > 0);

      if (hasConstraints) {
        lines.push("");
        lines.push("**Constraints:**");
        if (role.constraints.maxConcurrentTasks !== undefined) {
          lines.push(`- Max concurrent tasks: ${role.constraints.maxConcurrentTasks}`);
        }
        if (role.constraints.requireApprovalFor && role.constraints.requireApprovalFor.length > 0) {
          lines.push(`- Requires approval for: ${role.constraints.requireApprovalFor.join(", ")}`);
        }
      }
    }
  }

  return lines.join("\n");
}

/**
 * Generate a skill README.md.
 */
export function generateSkillReadme(skill: ResolvedSkill): string {
  const lines: string[] = [];
  const skillShortName = getAppShortName(skill.name);

  lines.push(`# ${skillShortName}`);
  lines.push("");
  lines.push(skill.description);
  lines.push("");
  lines.push("## Artifacts");
  for (const artifact of skill.artifacts) {
    lines.push(`- ${artifact}`);
  }

  return lines.join("\n");
}
