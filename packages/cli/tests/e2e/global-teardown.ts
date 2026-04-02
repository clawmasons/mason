import { execSync } from "node:child_process";

/**
 * Vitest globalTeardown — prunes orphaned mason Docker resources after all e2e tests complete.
 * Removes stopped mason containers and unused mason networks as a safety net.
 */
export default function globalTeardown(): void {
  // Remove stopped mason containers
  try {
    const containers = execSync(
      'docker ps -a --filter "name=mason-" --filter "status=exited" -q',
      { encoding: "utf-8" },
    ).trim();
    if (containers) {
      execSync(`docker rm ${containers}`, { encoding: "utf-8" });
    }
  } catch {
    // best-effort — Docker may not be available
  }

  // Remove unused mason networks
  try {
    const networks = execSync(
      'docker network ls --filter "name=mason-" -q',
      { encoding: "utf-8" },
    ).trim();
    if (networks) {
      for (const id of networks.split("\n")) {
        try {
          execSync(`docker network rm ${id}`, { encoding: "utf-8" });
        } catch {
          // network may still be in use — skip
        }
      }
    }
  } catch {
    // best-effort
  }
}
