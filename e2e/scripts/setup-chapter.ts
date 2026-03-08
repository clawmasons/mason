/**
 * E2E Setup Script — Create a temporary chapter workspace using `chapter init --template`.
 *
 * Usage:
 *   npm run setup
 *   # or: npx tsx scripts/setup-chapter.ts
 *
 * Environment variables:
 *   E2E_WORKSPACE_DIR — Override the temp directory path (default: e2e/tmp/chapter-e2e-<timestamp>)
 *
 * This script:
 * 1. Creates a temp workspace directory
 * 2. Runs `chapter init --template note-taker --name test.e2e` to scaffold the workspace
 * 3. Runs `chapter install @test.e2e/member-note-taker` to materialize the member
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

const PROJECT_NAME = "test.e2e";
const MEMBER_NAME = `@${PROJECT_NAME}/member-note-taker`;

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

  // 2. Create workspace directory
  fs.mkdirSync(workspaceDir, { recursive: true });
  console.log(`Created workspace at ${workspaceDir}`);

  // 3. Run chapter init --template note-taker --name e2e-test-chapter
  console.log("\nInitializing chapter workspace from template...");
  const chapterBin = path.resolve(E2E_ROOT, "..", "bin", "chapter.js");
  try {
    execFileSync(
      "node",
      [chapterBin, "init", "--template", "note-taker", "--name", PROJECT_NAME],
      {
        cwd: workspaceDir,
        stdio: "inherit",
      },
    );
  } catch {
    console.error("Error: chapter init --template note-taker failed.");
    process.exit(1);
  }

  // 4. Install the template member
  console.log(`\nInstalling member: ${MEMBER_NAME}...`);
  try {
    execFileSync("node", [chapterBin, "install", MEMBER_NAME], {
      cwd: workspaceDir,
      stdio: "inherit",
    });
    console.log(`  Installed ${MEMBER_NAME}`);
  } catch {
    console.warn(`Warning: chapter install ${MEMBER_NAME} failed.`);
  }

  // 5. Note .env availability
  const envFile = path.join(E2E_ROOT, ".env");
  if (fs.existsSync(envFile)) {
    console.log("\n.env file found — API keys available for live tests.");
  }

  // 6. Save workspace path for teardown and tests
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(LAST_WORKSPACE_FILE, workspaceDir);

  // Success
  console.log("\n=== Setup Complete ===");
  console.log(`  Workspace: ${workspaceDir}`);
  console.log(`  Member:    ${MEMBER_NAME}`);
  console.log(`  Teardown:  npm run teardown\n`);
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
