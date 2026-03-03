import type { ResolvedAgent } from "../resolver/types.js";
import type { LockFile, LockFileRole } from "./types.js";

/**
 * Generate a pam.lock.json object from a resolved agent and
 * the list of generated file paths.
 *
 * The lock file captures exact versions for reproducibility.
 * Output is deterministic — same input always produces the same result.
 */
export function generateLockFile(
  agent: ResolvedAgent,
  generatedFiles: string[],
): LockFile {
  const roles: LockFileRole[] = agent.roles.map((role) => ({
    name: role.name,
    version: role.version,
    tasks: role.tasks.map((t) => ({ name: t.name, version: t.version })),
    apps: role.apps.map((a) => ({ name: a.name, version: a.version })),
    skills: role.skills.map((s) => ({ name: s.name, version: s.version })),
  }));

  return {
    lockVersion: 1,
    agent: {
      name: agent.name,
      version: agent.version,
      runtimes: [...agent.runtimes],
    },
    roles,
    generatedFiles: [...generatedFiles].sort(),
  };
}
