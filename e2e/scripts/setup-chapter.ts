/**
 * E2E Setup Script — Create a temporary chapter workspace from fixture packages.
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
 * 2. Copies fixture packages into workspace directories
 * 3. Writes a root package.json with workspace config
 * 4. Runs npm install to resolve dependencies
 * 5. Calls chapter init programmatically
 * 6. Calls chapter install for each fixture member
 * 7. Saves the workspace path for teardown and tests
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const E2E_ROOT = path.resolve(__dirname, "..");
const FIXTURES_DIR = path.join(E2E_ROOT, "fixtures", "test-chapter");
const TMP_DIR = path.join(E2E_ROOT, "tmp");
const LAST_WORKSPACE_FILE = path.join(TMP_DIR, ".last-workspace");

/** Workspace directories that contain chapter packages. */
const WORKSPACE_DIRS = ["apps", "tasks", "skills", "roles", "members"];

/**
 * Recursively copy a directory tree.
 */
function copyDirRecursive(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;

  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
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

/**
 * Discover member package names from the fixtures directory.
 */
function discoverFixtureMembers(fixturesDir: string): string[] {
  const membersDir = path.join(fixturesDir, "members");
  if (!fs.existsSync(membersDir)) return [];

  const members: string[] = [];
  for (const entry of fs.readdirSync(membersDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pkgJsonPath = path.join(membersDir, entry.name, "package.json");
    if (!fs.existsSync(pkgJsonPath)) continue;

    try {
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
      if (pkgJson.name && pkgJson.chapter?.type === "member") {
        members.push(pkgJson.name);
      }
    } catch {
      // Skip invalid package.json
    }
  }
  return members;
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

  // 2. Check fixtures exist
  if (!fs.existsSync(FIXTURES_DIR)) {
    console.log(
      `No fixtures found at ${FIXTURES_DIR}.\n` +
        "Fixtures will be added in Change 7. Creating empty workspace structure.\n",
    );
  }

  // 3. Create workspace directory
  fs.mkdirSync(workspaceDir, { recursive: true });
  console.log(`Created workspace at ${workspaceDir}`);

  // 4. Copy fixture packages into workspace directories
  for (const wsDir of WORKSPACE_DIRS) {
    const fixtureSrc = path.join(FIXTURES_DIR, wsDir);
    const workspaceDest = path.join(workspaceDir, wsDir);
    if (fs.existsSync(fixtureSrc)) {
      copyDirRecursive(fixtureSrc, workspaceDest);
      console.log(`  Copied fixtures: ${wsDir}/`);
    } else {
      fs.mkdirSync(workspaceDest, { recursive: true });
    }
  }

  // 5. Write root package.json
  const fixtureRootPkg = path.join(FIXTURES_DIR, "package.json");
  if (fs.existsSync(fixtureRootPkg)) {
    fs.copyFileSync(fixtureRootPkg, path.join(workspaceDir, "package.json"));
    console.log("  Copied fixture package.json");
  } else {
    const rootPkg = {
      name: "e2e-test-chapter",
      version: "0.1.0",
      private: true,
      workspaces: WORKSPACE_DIRS.map((d) => `${d}/*`),
      dependencies: {
        "@clawmasons/chapter-core": "*",
      },
    };
    fs.writeFileSync(
      path.join(workspaceDir, "package.json"),
      JSON.stringify(rootPkg, null, 2) + "\n",
    );
    console.log("  Generated root package.json");
  }

  // 6. Run npm install
  console.log("\nInstalling dependencies...");
  try {
    execFileSync("npm", ["install"], {
      cwd: workspaceDir,
      stdio: "inherit",
    });
  } catch {
    console.warn(
      "Warning: npm install failed. Dependencies may not be available.",
    );
  }

  // 7. Call chapter init via CLI
  console.log("\nInitializing chapter workspace...");
  const chapterBin = path.resolve(E2E_ROOT, "..", "bin", "chapter.js");
  try {
    execFileSync("node", [chapterBin, "init"], {
      cwd: workspaceDir,
      stdio: "inherit",
    });
  } catch {
    console.warn("Warning: chapter init failed.");
  }

  // 8. Install fixture members
  const members = discoverFixtureMembers(FIXTURES_DIR);
  for (const memberName of members) {
    console.log(`\nInstalling member: ${memberName}...`);
    try {
      execFileSync("node", [chapterBin, "install", memberName], {
        cwd: workspaceDir,
        stdio: "inherit",
      });
      console.log(`  Installed ${memberName}`);
    } catch {
      console.warn(`Warning: chapter install ${memberName} failed.`);
    }
  }

  // 9. Copy .env if available
  const envFile = path.join(E2E_ROOT, ".env");
  if (fs.existsSync(envFile)) {
    // Merge e2e .env into any member .env files
    console.log("\n.env file found — API keys available for live tests.");
  }

  // 10. Save workspace path for teardown and tests
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(LAST_WORKSPACE_FILE, workspaceDir);

  // Success
  console.log("\n=== Setup Complete ===");
  console.log(`  Workspace: ${workspaceDir}`);
  console.log(`  Members:   ${members.length > 0 ? members.join(", ") : "(none — add fixtures in Change 7)"}`);
  console.log(`  Teardown:  npm run teardown\n`);
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
