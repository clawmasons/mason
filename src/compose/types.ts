/**
 * Represents a role entry in the lock file.
 */
export interface LockFileRole {
  name: string;
  version: string;
  tasks: Array<{ name: string; version: string }>;
  apps: Array<{ name: string; version: string }>;
  skills: Array<{ name: string; version: string }>;
}

/**
 * The chapter.lock.json structure.
 */
export interface LockFile {
  lockVersion: number;
  member: {
    name: string;
    version: string;
    memberType: "human" | "agent";
    runtimes: string[];
  };
  roles: LockFileRole[];
  generatedFiles: string[];
}
