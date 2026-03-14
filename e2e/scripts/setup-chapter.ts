/**
 * E2E Setup Script — Create a temporary chapter workspace and build agents.
 *
 * Usage:
 *   npm run setup
 *   # or: npx tsx scripts/setup-chapter.ts
 *
 * Environment variables:
 *   E2E_WORKSPACE_DIR — Override the temp directory path (default: e2e/tmp/chapter-e2e-<timestamp>)
 *
 * This script:
 * 1. Creates a temp workspace directory from fixtures
 * 2. Runs `chapter init --name test.chapter` if needed
 * 3. Runs `chapter build @test/agent-test-note-taker`
 * 4. Saves the workspace path for teardown and tests
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
const FIXTURES_DIR = path.join(E2E_ROOT, "fixtures", "test-chapter");

const AGENT_NAME = "@test/agent-test-note-taker";

/**
 * Recursively copy a directory tree, skipping node_modules and .git.
 */
function copyDirRecursive(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function main(): Promise<void> {
  console.log("=== E2E Chapter Setup ===\n");

  // 1. Determine workspace path
  const timestamp = Date.now();
  const workspaceDir =
    process.env.E2E_WORKSPACE_DIR ??
    path.join(TMP_DIR, `chapter-e2e-${timestamp}`);

  // Remove existing workspace if present (idempotent)
  if (fs.existsSync(workspaceDir)) {
    console.log(`Removing existing workspace at ${workspaceDir}...`);
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  }

  // 2. Create workspace from fixtures
  fs.mkdirSync(workspaceDir, { recursive: true });
  console.log(`Created workspace at ${workspaceDir}`);

  // Copy fixture tree
  const dirs = ["apps", "tasks", "skills", "roles", "agents", ".mason"];
  fs.copyFileSync(
    path.join(FIXTURES_DIR, "package.json"),
    path.join(workspaceDir, "package.json"),
  );
  for (const dir of dirs) {
    copyDirRecursive(
      path.join(FIXTURES_DIR, dir),
      path.join(workspaceDir, dir),
    );
  }

  // 3. Run chapter build
  console.log(`\nBuilding agent: ${AGENT_NAME}...`);
  const chapterBin = path.resolve(E2E_ROOT, "..", "bin", "chapter.js");
  try {
    execFileSync(
      "node",
      [chapterBin, "build", AGENT_NAME],
      {
        cwd: workspaceDir,
        stdio: "inherit",
      },
    );
  } catch {
    console.error(`Error: chapter build ${AGENT_NAME} failed.`);
    process.exit(1);
  }

  // 4. Note .env availability
  const envFile = path.join(E2E_ROOT, ".env");
  if (fs.existsSync(envFile)) {
    console.log("\n.env file found — API keys available for live tests.");
  }

  // 5. Save workspace path for teardown and tests
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(LAST_WORKSPACE_FILE, workspaceDir);

  // Success
  console.log("\n=== Setup Complete ===");
  console.log(`  Workspace: ${workspaceDir}`);
  console.log(`  Agent:     ${AGENT_NAME}`);
  console.log(`  Teardown:  npm run teardown\n`);
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
