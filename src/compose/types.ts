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
  agent: {
    name: string;
    version: string;
    runtimes: string[];
  };
  roles: LockFileRole[];
  generatedFiles: string[];
}
