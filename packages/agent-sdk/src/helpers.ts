import type { ResolvedRole, ResolvedTask, ResolvedSkill } from "@clawmasons/shared";
import { getAppShortName } from "@clawmasons/shared";
import type { AgentPackage } from "./types.js";

/**
 * Mapping from LLM provider identifiers to their environment variable names.
 *
 * Used by Dockerfile generators to inject the correct API key into
 * Docker Compose services, and by env template generation to include
 * the key in .env.example.
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

// ── agent-launch.json Generation ──────────────────────────────────────

/** Credential configuration for agent-launch.json. */
export interface LaunchCredentialConfig {
  key: string;
  type: "env" | "file";
  path?: string;
}

/**
 * Generate agent-launch.json content for the agent-entry entrypoint.
 *
 * Uses the AgentPackage's runtime config to determine command, args,
 * and runtime-specific credentials. Merges with role-declared credentials.
 *
 * @param agentPkg - The agent package providing runtime config
 * @param roleCredentials - Credential keys declared by the role
 * @param acpMode - Whether to generate ACP mode config
 * @returns JSON string of agent-launch.json
 */
export function generateAgentLaunchJson(
  agentPkg: AgentPackage,
  roleCredentials: string[],
  acpMode?: boolean,
  instructions?: string,
  agentArgs?: string[],
  initialPrompt?: string,
): string {
  // Start with runtime-specific credentials from the agent package
  const credentials: LaunchCredentialConfig[] = [
    ...(agentPkg.runtime?.credentials ?? []),
  ];

  // Add role-declared credentials as env vars (skip any already added as runtime credentials)
  const runtimeKeys = new Set(credentials.map((c) => c.key));
  for (const key of roleCredentials) {
    if (!runtimeKeys.has(key)) {
      credentials.push({ key, type: "env" });
    }
  }

  // Determine command
  let command: string;
  let args: string[] | undefined;

  if (acpMode && agentPkg.acp) {
    const parts = agentPkg.acp.command.split(/\s+/);
    command = parts[0];
    args = parts.length > 1 ? parts.slice(1) : undefined;
  } else {
    command = agentPkg.runtime?.command ?? agentPkg.name;
    args = agentPkg.runtime?.args;
  }

  if (instructions && !acpMode && agentPkg.runtime?.supportsAppendSystemPrompt) {
    args = [...(args ?? []), "--append-system-prompt", instructions];
  }

  // Append alias-level agent-args after all other resolved args
  if (agentArgs && agentArgs.length > 0) {
    args = [...(args ?? []), ...agentArgs];
  }

  // Append initial prompt as final bare positional arg
  if (initialPrompt && !acpMode) {
    args = [...(args ?? []), initialPrompt];
  }

  const config: Record<string, unknown> = { credentials, command };
  if (args && args.length > 0) {
    config.args = args;
  }

  return JSON.stringify(config, null, 2);
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
