import type { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import * as readline from "node:readline";

// ── Types ──────────────────────────────────────────────────────────────

interface DoctorOptions {
  quick?: boolean;
  auto?: boolean;
}

interface ScanResult {
  stoppedContainers: string[];
  stuckContainers: string[];
  danglingImages: string[];
  orphanedSessions: string[];
  // Full mode only
  runningContainers?: string[];
  unusedVolumes?: string[];
  unusedNetworks?: string[];
  diskUsage?: string;
}

interface CleanupResult {
  containersRemoved: number;
  imagesRemoved: boolean;
  sessionsRemoved: number;
  volumesRemoved: number;
  networksRemoved: number;
}

/** Dependency injection for testing. */
export interface DoctorDeps {
  execSyncFn?: (cmd: string) => string;
  readdirSyncFn?: (p: string) => string[];
  existsSyncFn?: (p: string) => boolean;
  rmSyncFn?: (p: string, opts?: { recursive?: boolean; force?: boolean }) => void;
  confirmFn?: (message: string) => Promise<boolean>;
  logFn?: (message: string) => void;
}

// ── Command Registration ───────────────────────────────────────────────

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Diagnose Docker health and clean up stale resources")
    .option("--quick", "Scan only safe-to-remove resources (stopped containers, dangling images, orphaned sessions)")
    .option("--auto", "Skip confirmation prompts and execute cleanup immediately")
    .action(async (options: DoctorOptions) => {
      await runDoctor(process.cwd(), options);
    });
}

// ── Core Logic ─────────────────────────────────────────────────────────

export async function runDoctor(
  projectDir: string,
  options: DoctorOptions,
  deps?: DoctorDeps,
): Promise<void> {
  const exec = deps?.execSyncFn ?? defaultExecSync;
  const log = deps?.logFn ?? console.log;

  // Check Docker availability
  try {
    exec("docker info");
  } catch {
    console.error("\n  Docker is not available. Make sure Docker is installed and running.\n");
    process.exit(1);
    return;
  }

  const isQuick = options.quick === true;
  const isAuto = options.auto === true;

  log(`\n  Mason Doctor${isQuick ? " (quick)" : ""}\n`);

  // Scan
  const scan = scanResources(projectDir, isQuick, deps);

  // Report
  const hasIssues = reportScan(scan, isQuick, log);

  if (!hasIssues) {
    log("  ✓ System is clean — no stale resources found.\n");
    return;
  }

  // Confirm
  if (!isAuto) {
    const confirm = deps?.confirmFn ?? defaultConfirm;
    const proceed = await confirm("  Proceed with cleanup?");
    if (!proceed) {
      log("  Cleanup skipped.\n");
      return;
    }
  }

  // Cleanup
  const result = cleanup(scan, isQuick, deps);
  reportCleanup(result, log);
}

// ── Scanning ───────────────────────────────────────────────────────────

function scanResources(
  projectDir: string,
  quickMode: boolean,
  deps?: DoctorDeps,
): ScanResult {
  const exec = deps?.execSyncFn ?? defaultExecSync;
  const readdir = deps?.readdirSyncFn ?? ((p: string) => {
    try { return fs.readdirSync(p); } catch { return []; }
  });
  const exists = deps?.existsSyncFn ?? fs.existsSync;

  // Stopped mason containers
  const stoppedContainers = listContainers(exec, "exited");

  // Stuck containers (created but never started — typically a Docker daemon issue)
  const stuckContainers = listContainers(exec, "created");

  // Dangling images
  const danglingImages = listDanglingImages(exec);

  // Orphaned session directories
  const orphanedSessions = findOrphanedSessions(projectDir, exec, readdir, exists);

  const result: ScanResult = {
    stoppedContainers,
    stuckContainers,
    danglingImages,
    orphanedSessions,
  };

  if (!quickMode) {
    result.runningContainers = listContainers(exec, "running");
    result.unusedVolumes = listUnusedVolumes(exec);
    result.unusedNetworks = listUnusedNetworks(exec);
    result.diskUsage = getDiskUsage(exec);
  }

  return result;
}

function listContainers(exec: (cmd: string) => string, status: "exited" | "running" | "created"): string[] {
  try {
    const output = exec(
      `docker ps --filter "status=${status}" --filter "label=com.docker.compose.project" --format "{{.ID}} {{.Names}}"`,
    );
    return output.split("\n").filter((line) => line.trim() && isMasonResource(line));
  } catch {
    return [];
  }
}

function listDanglingImages(exec: (cmd: string) => string): string[] {
  try {
    const output = exec('docker images --filter "dangling=true" --format "{{.ID}} {{.Repository}}:{{.Tag}}"');
    return output.split("\n").filter((line) => line.trim());
  } catch {
    return [];
  }
}

function findOrphanedSessions(
  projectDir: string,
  exec: (cmd: string) => string,
  readdir: (p: string) => string[],
  exists: (p: string) => boolean,
): string[] {
  const sessionsDir = path.join(projectDir, ".mason", "sessions");
  if (!exists(sessionsDir)) return [];

  const entries = readdir(sessionsDir);
  const orphaned: string[] = [];

  // Get list of running compose projects
  let runningProjects: Set<string>;
  try {
    const output = exec("docker compose ls --format json");
    const projects = JSON.parse(output) as Array<{ Name: string }>;
    runningProjects = new Set(projects.map((p) => p.Name));
  } catch {
    runningProjects = new Set();
  }

  for (const sessionId of entries) {
    const sessionDir = path.join(sessionsDir, sessionId);
    const composePath = path.join(sessionDir, "docker-compose.yaml");
    if (!exists(composePath)) {
      orphaned.push(sessionId);
      continue;
    }

    // Check if any compose project references this session
    // Session compose projects typically use directory-name based naming
    const isActive = runningProjects.has(sessionId) ||
      [...runningProjects].some((name) => name.includes(sessionId));

    if (!isActive) {
      orphaned.push(sessionId);
    }
  }

  return orphaned;
}

function listUnusedVolumes(exec: (cmd: string) => string): string[] {
  try {
    const output = exec('docker volume ls --filter "dangling=true" --format "{{.Name}}"');
    return output.split("\n").filter((line) => line.trim() && isMasonResource(line));
  } catch {
    return [];
  }
}

function listUnusedNetworks(exec: (cmd: string) => string): string[] {
  try {
    // List networks not used by any container, excluding default ones
    const output = exec('docker network ls --format "{{.ID}} {{.Name}}"');
    const lines = output.split("\n").filter((line) => line.trim());
    return lines.filter((line) => {
      const name = line.split(" ")[1] ?? "";
      return isMasonResource(name) && !["bridge", "host", "none"].includes(name);
    });
  } catch {
    return [];
  }
}

function getDiskUsage(exec: (cmd: string) => string): string {
  try {
    return exec("docker system df");
  } catch {
    return "Unable to retrieve disk usage.";
  }
}

/** Check if a Docker resource name matches mason naming patterns. */
function isMasonResource(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes("mason") || lower.includes("clawmason");
}

// ── Reporting ──────────────────────────────────────────────────────────

function reportScan(scan: ScanResult, quickMode: boolean, log: (msg: string) => void): boolean {
  let hasIssues = false;

  if (scan.stoppedContainers.length > 0) {
    log(`  Stopped containers: ${scan.stoppedContainers.length}`);
    hasIssues = true;
  }

  if (scan.stuckContainers.length > 0) {
    log(`  Stuck containers (never started): ${scan.stuckContainers.length}`);
    hasIssues = true;
  }

  if (scan.danglingImages.length > 0) {
    log(`  Dangling images: ${scan.danglingImages.length}`);
    hasIssues = true;
  }

  if (scan.orphanedSessions.length > 0) {
    log(`  Orphaned sessions: ${scan.orphanedSessions.length}`);
    hasIssues = true;
  }

  if (!quickMode) {
    if (scan.runningContainers && scan.runningContainers.length > 0) {
      log(`  Running containers: ${scan.runningContainers.length}`);
    }

    if (scan.unusedVolumes && scan.unusedVolumes.length > 0) {
      log(`  Unused volumes: ${scan.unusedVolumes.length}`);
      hasIssues = true;
    }

    if (scan.unusedNetworks && scan.unusedNetworks.length > 0) {
      log(`  Unused networks: ${scan.unusedNetworks.length}`);
      hasIssues = true;
    }

    if (scan.diskUsage) {
      log(`\n  Docker disk usage:\n${scan.diskUsage}`);
    }
  }

  if (hasIssues) {
    log("");
  }

  return hasIssues;
}

function reportCleanup(result: CleanupResult, log: (msg: string) => void): void {
  log("\n  Cleanup complete:");
  if (result.containersRemoved > 0) {
    log(`    Containers removed: ${result.containersRemoved}`);
  }
  if (result.imagesRemoved) {
    log("    Dangling images pruned");
  }
  if (result.sessionsRemoved > 0) {
    log(`    Sessions removed: ${result.sessionsRemoved}`);
  }
  if (result.volumesRemoved > 0) {
    log(`    Volumes removed: ${result.volumesRemoved}`);
  }
  if (result.networksRemoved > 0) {
    log(`    Networks removed: ${result.networksRemoved}`);
  }
  log("");
}

// ── Cleanup ────────────────────────────────────────────────────────────

function cleanup(
  scan: ScanResult,
  quickMode: boolean,
  deps?: DoctorDeps,
): CleanupResult {
  const exec = deps?.execSyncFn ?? defaultExecSync;
  const rm = deps?.rmSyncFn ?? fs.rmSync;

  const result: CleanupResult = {
    containersRemoved: 0,
    imagesRemoved: false,
    sessionsRemoved: 0,
    volumesRemoved: 0,
    networksRemoved: 0,
  };

  // Remove stopped containers
  for (const container of scan.stoppedContainers) {
    const containerId = container.split(" ")[0];
    if (!containerId) continue;
    try {
      exec(`docker rm ${containerId}`);
      result.containersRemoved++;
    } catch {
      // Skip containers that can't be removed
    }
  }

  // Force-remove stuck containers (created but never started)
  for (const container of scan.stuckContainers) {
    const containerId = container.split(" ")[0];
    if (!containerId) continue;
    try {
      exec(`docker rm -f ${containerId}`);
      result.containersRemoved++;
    } catch {
      // Skip containers that can't be removed
    }
  }

  // Prune dangling images
  if (scan.danglingImages.length > 0) {
    try {
      exec("docker image prune -f");
      result.imagesRemoved = true;
    } catch {
      // Non-fatal
    }
  }

  // Remove orphaned session directories
  for (const sessionId of scan.orphanedSessions) {
    try {
      // Try to stop any lingering containers for this session first
      try {
        exec(`docker compose -f .mason/sessions/${sessionId}/docker-compose.yaml down 2>/dev/null`);
      } catch {
        // Compose file might not be valid or containers already gone
      }
      rm(path.join(process.cwd(), ".mason", "sessions", sessionId), { recursive: true, force: true });
      result.sessionsRemoved++;
    } catch {
      // Skip sessions that can't be removed
    }
  }

  // Full mode: remove unused volumes and networks
  if (!quickMode) {
    if (scan.unusedVolumes) {
      for (const volume of scan.unusedVolumes) {
        const volumeName = volume.trim();
        if (!volumeName) continue;
        try {
          exec(`docker volume rm ${volumeName}`);
          result.volumesRemoved++;
        } catch {
          // Skip volumes that can't be removed
        }
      }
    }

    if (scan.unusedNetworks) {
      for (const network of scan.unusedNetworks) {
        const networkId = network.split(" ")[0];
        if (!networkId) continue;
        try {
          exec(`docker network rm ${networkId}`);
          result.networksRemoved++;
        } catch {
          // Skip networks that can't be removed
        }
      }
    }
  }

  return result;
}

// ── Exported Quick Auto Cleanup ────────────────────────────────────────

/**
 * Run quick+auto cleanup silently. Suitable for programmatic use
 * (e.g., called at the start of `mason run`).
 *
 * Scans for stopped containers, dangling images, and orphaned sessions,
 * then removes them without prompting or printing.
 */
export async function quickAutoCleanup(
  projectDir: string,
  deps?: DoctorDeps,
): Promise<void> {
  const exec = deps?.execSyncFn ?? defaultExecSync;

  // Quick Docker availability check
  try {
    exec("docker info");
  } catch {
    return; // Docker not available, skip silently
  }

  const scan = scanResources(projectDir, true, deps);

  const hasIssues =
    scan.stoppedContainers.length > 0 ||
    scan.stuckContainers.length > 0 ||
    scan.danglingImages.length > 0 ||
    scan.orphanedSessions.length > 0;

  if (!hasIssues) return;

  // Silent cleanup — no logging
  const noop = () => {};
  cleanup(scan, true, { ...deps, logFn: noop });
}

// ── Helpers ────────────────────────────────────────────────────────────

function defaultExecSync(cmd: string): string {
  return execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

async function defaultConfirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${message} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}
