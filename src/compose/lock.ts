import type { ResolvedMember } from "../resolver/types.js";
import type { LockFile, LockFileRole } from "./types.js";

/**
 * Generate a chapter.lock.json object from a resolved member and
 * the list of generated file paths.
 *
 * The lock file captures exact versions for reproducibility.
 * Output is deterministic — same input always produces the same result.
 */
export function generateLockFile(
  member: ResolvedMember,
  generatedFiles: string[],
): LockFile {
  const roles: LockFileRole[] = member.roles.map((role) => ({
    name: role.name,
    version: role.version,
    tasks: role.tasks.map((t) => ({ name: t.name, version: t.version })),
    apps: role.apps.map((a) => ({ name: a.name, version: a.version })),
    skills: role.skills.map((s) => ({ name: s.name, version: s.version })),
  }));

  return {
    lockVersion: 1,
    member: {
      name: member.name,
      version: member.version,
      memberType: member.memberType,
      runtimes: [...member.runtimes],
    },
    roles,
    generatedFiles: [...generatedFiles].sort(),
  };
}
