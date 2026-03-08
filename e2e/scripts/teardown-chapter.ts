/**
 * E2E Teardown Script — Clean up a temporary chapter workspace.
 *
 * Usage:
 *   npm run teardown
 *   # or: npx tsx scripts/teardown-chapter.ts
 *
 * Environment variables:
 *   E2E_WORKSPACE_DIR — Override the workspace path to tear down
 *
 * This script:
 * 1. Reads the workspace path from .last-workspace or E2E_WORKSPACE_DIR
 * 2. Stops any running Docker Compose stacks in docker/ directories
 * 3. Removes the workspace directory
 * 4. Cleans up the .last-workspace tracking file
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const E2E_ROOT = path.resolve(__dirname, "..");
const TMP_DIR = path.join(E2E_ROOT, "tmp");
const LAST_WORKSPACE_FILE = path.join(TMP_DIR, ".last-workspace");

/**
 * Find docker-compose.yml files in the docker/ directory.
 */
function findComposeFiles(workspaceDir: string): string[] {
  const dockerDir = path.join(workspaceDir, "docker");
  if (!fs.existsSync(dockerDir)) return [];

  const composeFiles: string[] = [];

  // Check for compose file directly in docker/
  const rootCompose = path.join(dockerDir, "docker-compose.yml");
  if (fs.existsSync(rootCompose)) {
    composeFiles.push(rootCompose);
  }

  // Check in agent subdirectories
  const agentDir = path.join(dockerDir, "agent");
  if (fs.existsSync(agentDir)) {
    try {
      for (const entry of fs.readdirSync(agentDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const composePath = path.join(agentDir, entry.name, "docker-compose.yml");
        if (fs.existsSync(composePath)) {
          composeFiles.push(composePath);
        }
      }
    } catch {
      // Directory might not exist
    }
  }

  return composeFiles;
}

async function main(): Promise<void> {
  console.log("=== E2E Chapter Teardown ===\n");

  // 1. Determine workspace path
  const workspaceDir =
    process.env.E2E_WORKSPACE_DIR ??
    (fs.existsSync(LAST_WORKSPACE_FILE)
      ? fs.readFileSync(LAST_WORKSPACE_FILE, "utf-8").trim()
      : null);

  if (!workspaceDir) {
    console.log("No workspace to tear down. (.last-workspace not found and E2E_WORKSPACE_DIR not set)");
    return;
  }

  if (!fs.existsSync(workspaceDir)) {
    console.log(`Workspace directory does not exist: ${workspaceDir}`);
    // Clean up tracking file anyway
    if (fs.existsSync(LAST_WORKSPACE_FILE)) {
      fs.unlinkSync(LAST_WORKSPACE_FILE);
    }
    return;
  }

  console.log(`Workspace: ${workspaceDir}`);

  // 2. Stop Docker Compose stacks
  const composeFiles = findComposeFiles(workspaceDir);
  for (const composePath of composeFiles) {
    const composeDir = path.dirname(composePath);
    const name = path.basename(composeDir);
    console.log(`Stopping Docker stack: ${name}...`);
    try {
      execFileSync("docker", ["compose", "-f", composePath, "down", "--remove-orphans"], {
        cwd: composeDir,
        stdio: "inherit",
        timeout: 30_000,
      });
      console.log(`  Stopped ${name}`);
    } catch {
      console.warn(`  Warning: Failed to stop Docker stack for ${name} (may not be running)`);
    }
  }

  // 3. Remove workspace directory
  console.log(`\nRemoving workspace: ${workspaceDir}...`);
  fs.rmSync(workspaceDir, { recursive: true, force: true });
  console.log("  Removed workspace directory");

  // 4. Clean up tracking file
  if (fs.existsSync(LAST_WORKSPACE_FILE)) {
    fs.unlinkSync(LAST_WORKSPACE_FILE);
    console.log("  Removed .last-workspace tracking file");
  }

  console.log("\n=== Teardown Complete ===\n");
}

main().catch((err) => {
  console.error("Teardown failed:", err);
  process.exit(1);
});
