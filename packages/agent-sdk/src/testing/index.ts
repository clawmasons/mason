/**
 * Shared E2E test utilities for mason agent packages.
 *
 * Provides workspace setup, CLI execution helpers, Docker utilities,
 * and fixture management. Importable as `@clawmasons/agent-sdk/testing`.
 *
 * Dependency constraint: This module MUST NOT import from @clawmasons/cli,
 * @clawmasons/mcp-agent, or any agent implementation package. Only Node.js
 * built-ins are allowed.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// ── Path Constants ──────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the monorepo root by walking up from this file until we find
 * a package.json with a "workspaces" field.
 */
function findProjectRoot(): string {
  // At runtime this file is at:
  //   packages/agent-sdk/dist/testing/index.js  (compiled)
  //   packages/agent-sdk/src/testing/index.ts   (source / ts-node)
  // Walk up to find the monorepo root.
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        if (pkg.workspaces) {
          return dir;
        }
      } catch {
        // Not valid JSON, keep walking
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break; // filesystem root
    dir = parent;
  }
  throw new Error(
    "Cannot resolve monorepo root. Ensure @clawmasons/agent-sdk is inside the mason monorepo.",
  );
}

/** Absolute path to the monorepo root. */
export const PROJECT_ROOT: string = findProjectRoot();

/** Absolute path to the `scripts/mason.js` CLI entry point. */
export const MASON_BIN: string = path.join(PROJECT_ROOT, "scripts", "mason.js");

/** Absolute path to `packages/agent-sdk/fixtures/`. */
export const FIXTURES_DIR: string = path.join(
  PROJECT_ROOT,
  "packages",
  "agent-sdk",
  "fixtures",
);

// ── Internal Helpers ────────────────────────────────────────────────────

/** Workspace directories to copy from fixtures by default. */
const WORKSPACE_DIRS = [
  "apps",
  "tasks",
  "skills",
  "roles",
  "agents",
  ".mason",
  ".claude",
];

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

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Copy a fixture workspace to a temporary directory.
 *
 * @param name - A short name used in the temp dir path (e.g., "build-pipeline")
 * @param opts.fixture - Fixture directory name under FIXTURES_DIR (default: "claude-test-project")
 * @param opts.excludePaths - Relative paths within the workspace to remove after copying
 * @param opts.extraDirs - Additional directories to copy beyond the default WORKSPACE_DIRS set
 * @returns Absolute path to the created workspace directory
 */
export function copyFixtureWorkspace(
  name: string,
  opts?: {
    fixture?: string;
    excludePaths?: string[];
    extraDirs?: string[];
  },
): string {
  const fixtureName = opts?.fixture ?? "claude-test-project";
  const fixtureDir = path.join(FIXTURES_DIR, fixtureName);

  if (!fs.existsSync(fixtureDir)) {
    throw new Error(
      `Fixture '${fixtureName}' not found in ${FIXTURES_DIR}.`,
    );
  }

  const timestamp = Date.now();
  const workspaceDir = path.join(
    os.tmpdir(),
    `mason-e2e-${name}-${timestamp}`,
  );
  fs.mkdirSync(workspaceDir, { recursive: true });

  // Copy root package.json
  const pkgSrc = path.join(fixtureDir, "package.json");
  if (fs.existsSync(pkgSrc)) {
    fs.copyFileSync(pkgSrc, path.join(workspaceDir, "package.json"));
  }

  // Copy workspace directories (defaults + extras)
  const dirsToProcess = [
    ...WORKSPACE_DIRS,
    ...(opts?.extraDirs ?? []),
  ];

  for (const wsDir of dirsToProcess) {
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
 * Poll a health endpoint until it responds with 200 or timeout is reached.
 * On failure, fetches Docker Compose logs for diagnostics.
 */
export async function waitForHealth(
  url: string,
  timeoutMs: number,
  diagnostics?: {
    composeProject: string;
    composeFile: string;
    service: string;
  },
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
      } catch {
        /* best effort */
      }
    }
    throw new Error(msg);
  }
}

/**
 * Tear down Docker Compose sessions in a workspace's `.mason/sessions/` directory.
 * Best-effort: logs errors but does not throw.
 */
export function cleanupDockerSessions(workspaceDir: string): void {
  const sessionsDir = path.join(workspaceDir, ".mason", "sessions");
  if (!fs.existsSync(sessionsDir)) return;

  for (const sessionId of fs.readdirSync(sessionsDir)) {
    const composeFile = path.join(
      sessionsDir,
      sessionId,
      "docker",
      "docker-compose.yml",
    );
    if (fs.existsSync(composeFile)) {
      try {
        execSync(
          `docker compose -f "${composeFile}" down --rmi local --volumes`,
          { stdio: "pipe", timeout: 60_000 },
        );
      } catch {
        /* best-effort cleanup */
      }
    }
  }
}
