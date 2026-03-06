import type { ResolvedMember, ResolvedRole, ResolvedTask, ResolvedSkill } from "../resolver/types.js";
import { getAppShortName } from "../generator/toolfilter.js";

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
export function generateAgentsMd(member: ResolvedMember): string {
  const agentShortName = getAppShortName(member.name);
  const lines: string[] = [];

  lines.push(`# Agent: ${agentShortName}`);
  lines.push("");
  lines.push("You are an agent managed by chapter (Clawmasons Chapter).");
  lines.push("You have multiple roles. Each task you execute specifies which");
  lines.push("role is active. Only use tools permitted by the active role.");
  lines.push("");
  lines.push("## Roles");

  for (const role of member.roles) {
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
