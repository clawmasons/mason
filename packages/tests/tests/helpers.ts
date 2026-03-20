/**
 * Shared E2E test utilities.
 *
 * Provides workspace setup, CLI execution helpers, and Docker utilities
 * so that individual test files stay focused on assertions.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const E2E_ROOT = path.resolve(__dirname, "..");
export const PROJECT_ROOT = path.resolve(E2E_ROOT, "../..");
export const FIXTURES_BASE = path.join(E2E_ROOT, "fixtures");
export const FIXTURES_DIR = path.join(FIXTURES_BASE, "test-mason");
export const MASON_BIN = path.join(PROJECT_ROOT, "scripts", "mason.js");

/** Workspace directories to copy from fixtures. */
const WORKSPACE_DIRS = ["apps", "tasks", "skills", "roles", "agents", ".mason", ".claude"];

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

/**
 * Copy the fixture workspace to a temporary directory.
 *
 * @param name - A short name used in the temp dir path (e.g., "build-pipeline")
 * @param opts.excludePaths - Relative paths within the workspace to remove after copying
 *                            (e.g., ["agents/mcp-test", "roles/mcp-test"])
 * @param opts.fixture - Fixture directory name under e2e/fixtures/ (default: "test-mason")
 */
export function copyFixtureWorkspace(
  name: string,
  opts?: { excludePaths?: string[]; fixture?: string },
): string {
  const fixtureDir = opts?.fixture
    ? path.join(FIXTURES_BASE, opts.fixture)
    : FIXTURES_DIR;

  const timestamp = Date.now();
  const workspaceDir = path.join(E2E_ROOT, "tmp", `${name}-${timestamp}`);
  fs.mkdirSync(workspaceDir, { recursive: true });

  // Copy root package.json
  fs.copyFileSync(
    path.join(fixtureDir, "package.json"),
    path.join(workspaceDir, "package.json"),
  );

  // Copy workspace directories
  for (const wsDir of WORKSPACE_DIRS) {
    const fixtureSrc = path.join(fixtureDir, wsDir);
    const workspaceDest = path.join(workspaceDir, wsDir);
    if (fs.existsSync(fixtureSrc)) {
      copyDirRecursive(fixtureSrc, workspaceDest);
    } else {
      fs.mkdirSync(workspaceDest, { recursive: true });
    }
  }

  // Remove excluded paths
  if (opts?.excludePaths) {
    for (const rel of opts.excludePaths) {
      const full = path.join(workspaceDir, rel);
      if (fs.existsSync(full)) {
        fs.rmSync(full, { recursive: true, force: true });
      }
    }
  }

  return workspaceDir;
}

/**
 * Run a `mason` CLI command and return stdout.
 * Throws on non-zero exit code.
 */
export function masonExec(
  args: string[],
  cwd: string,
  opts?: { timeout?: number },
): string {
  return execFileSync("node", [MASON_BIN, ...args], {
    cwd,
    stdio: "pipe",
    timeout: opts?.timeout ?? 30_000,
  }).toString();
}

/**
 * Run a `mason` CLI command with --json and parse the output.
 */
export function masonExecJson<T>(
  args: string[],
  cwd: string,
  opts?: { timeout?: number },
): T {
  const output = masonExec(args, cwd, opts);
  return JSON.parse(output) as T;
}

/**
 * Check if Docker daemon is available.
 */
export function isDockerAvailable(): boolean {
  try {
    execSync("docker info", { stdio: "pipe", timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run a `mason` CLI command that is expected to fail (non-zero exit code).
 * Returns { stdout, stderr, exitCode }.
 */
export function masonExecExpectError(
  args: string[],
  cwd: string,
  opts?: { timeout?: number },
): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync("node", [MASON_BIN, ...args], {
      cwd,
      stdio: "pipe",
      timeout: opts?.timeout ?? 30_000,
    }).toString();
    // If it didn't throw, the command succeeded unexpectedly
    return { stdout, stderr: "", exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: Buffer; stderr?: Buffer; status?: number };
    return {
      stdout: e.stdout?.toString() ?? "",
      stderr: e.stderr?.toString() ?? "",
      exitCode: e.status ?? 1,
    };
  }
}

/**
 * Poll a health endpoint until it responds with 200 or timeout is reached.
 * On failure, fetches Docker Compose logs for diagnostics.
 */
export async function waitForHealth(
  url: string,
  timeoutMs: number,
  diagnostics?: { composeProject: string; composeFile: string; service: string },
): Promise<void> {
  const start = Date.now();
  let ready = false;

  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        ready = true;
        break;
      }
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }

  if (!ready) {
    let msg = `Health endpoint ${url} did not become ready within ${timeoutMs}ms.`;
    if (diagnostics) {
      try {
        const logs = execSync(
          `docker compose -p ${diagnostics.composeProject} -f "${diagnostics.composeFile}" logs ${diagnostics.service}`,
          { stdio: "pipe" },
        ).toString();
        msg += `\nDocker logs:\n${logs}`;
      } catch { /* best effort */ }
    }
    throw new Error(msg);
  }
}
