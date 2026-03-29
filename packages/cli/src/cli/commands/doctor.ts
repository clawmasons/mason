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
  logCmdFn?: (cmd: string) => void;
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
  const logCmd = deps?.logCmdFn ?? defaultLogCmd(log);

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
  const scan = scanResources(projectDir, isQuick, { ...deps, logCmdFn: logCmd });

  // Report
  const hasIssues = reportScan(scan, isQuick, log);

  if (!hasIssues) {
    log("  ✓ System is clean — no stale resources found.\n");
    printDeepCleanSuggestions(log);
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
  const result = cleanup(scan, isQuick, { ...deps, logCmdFn: logCmd });
  reportCleanup(result, log);
  printDeepCleanSuggestions(log);
}

// ── Scanning ───────────────────────────────────────────────────────────

function scanResources(
  projectDir: string,
  quickMode: boolean,
  deps?: DoctorDeps,
): ScanResult {
  const exec = deps?.execSyncFn ?? defaultExecSync;
  const logCmd = deps?.logCmdFn ?? (() => {});
  const readdir = deps?.readdirSyncFn ?? ((p: string) => {
    try { return fs.readdirSync(p); } catch { return []; }
  });
  const exists = deps?.existsSyncFn ?? fs.existsSync;

  // Stopped mason containers
  const stoppedContainers = listContainers(exec, logCmd, "exited");

  // Stuck containers (created but never started — typically a Docker daemon issue)
  const stuckContainers = listContainers(exec, logCmd, "created");

  // Dangling images
  const danglingImages = listDanglingImages(exec, logCmd);

  // Orphaned session directories
  const orphanedSessions = findOrphanedSessions(projectDir, exec, logCmd, readdir, exists);

  const result: ScanResult = {
    stoppedContainers,
    stuckContainers,
    danglingImages,
    orphanedSessions,
  };

  if (!quickMode) {
    result.runningContainers = listContainers(exec, logCmd, "running");
    result.unusedVolumes = listUnusedVolumes(exec, logCmd);
    result.unusedNetworks = listUnusedNetworks(exec, logCmd);
    result.diskUsage = getDiskUsage(exec, logCmd);
  }

  return result;
}

function listContainers(exec: (cmd: string) => string, logCmd: (cmd: string) => void, status: "exited" | "running" | "created"): string[] {
  try {
    const cmd = `docker ps --filter "status=${status}" --filter "label=com.docker.compose.project" --format "{{.ID}} {{.Names}}"`;
    logCmd(cmd);
    const output = exec(cmd);
    return output.split("\n").filter((line) => line.trim() && isMasonResource(line));
  } catch {
    return [];
  }
}

function listDanglingImages(exec: (cmd: string) => string, logCmd: (cmd: string) => void): string[] {
  try {
    const cmd = 'docker images --filter "dangling=true" --format "{{.ID}} {{.Repository}}:{{.Tag}}"';
    logCmd(cmd);
    const output = exec(cmd);
    return output.split("\n").filter((line) => line.trim());
  } catch {
    return [];
  }
}

function findOrphanedSessions(
  projectDir: string,
  exec: (cmd: string) => string,
  logCmd: (cmd: string) => void,
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
    const cmd = "docker compose ls --format json";
    logCmd(cmd);
    const output = exec(cmd);
    const projects = JSON.parse(output) as Array<{ Name: string }>;
    runningProjects = new Set(projects.map((p) => p.Name));
  } catch {
    runningProjects = new Set();
  }

  for (const sessionId of entries) {
    const sessionDir = path.join(sessionsDir, sessionId);
    const composePath = path.join(sessionDir, "docker-compose.yaml");
    const metaPath = path.join(sessionDir, "meta.json");
    if (!exists(composePath) && !exists(metaPath)) {
      orphaned.push(sessionId);
      continue;
    }
    // Sessions with meta.json but no compose file are ACP-managed — skip them
    if (!exists(composePath)) {
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

function listUnusedVolumes(exec: (cmd: string) => string, logCmd: (cmd: string) => void): string[] {
  try {
    const cmd = 'docker volume ls --filter "dangling=true" --format "{{.Name}}"';
    logCmd(cmd);
    const output = exec(cmd);
    return output.split("\n").filter((line) => line.trim() && isMasonResource(line));
  } catch {
    return [];
  }
}

function listUnusedNetworks(exec: (cmd: string) => string, logCmd: (cmd: string) => void): string[] {
  try {
    const cmd = 'docker network ls --format "{{.ID}} {{.Name}}"';
    logCmd(cmd);
    const output = exec(cmd);
    const lines = output.split("\n").filter((line) => line.trim());
    return lines.filter((line) => {
      const name = line.split(" ")[1] ?? "";
      return isMasonResource(name) && !["bridge", "host", "none"].includes(name);
    });
  } catch {
    return [];
  }
}

function getDiskUsage(exec: (cmd: string) => string, logCmd: (cmd: string) => void): string {
  try {
    const cmd = "docker system df";
    logCmd(cmd);
    return exec(cmd);
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
  const logCmd = deps?.logCmdFn ?? (() => {});
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
      const cmd = `docker rm ${containerId}`;
      logCmd(cmd);
      exec(cmd);
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
      const cmd = `docker rm -f ${containerId}`;
      logCmd(cmd);
      exec(cmd);
      result.containersRemoved++;
    } catch {
      // Skip containers that can't be removed
    }
  }

  // Prune dangling images
  if (scan.danglingImages.length > 0) {
    try {
      const cmd = "docker image prune -f";
      logCmd(cmd);
      exec(cmd);
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
        const cmd = `docker compose -f .mason/sessions/${sessionId}/docker-compose.yaml down --volumes 2>/dev/null`;
        logCmd(cmd);
        exec(cmd);
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
          const cmd = `docker volume rm ${volumeName}`;
          logCmd(cmd);
          exec(cmd);
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
          const cmd = `docker network rm ${networkId}`;
          logCmd(cmd);
          exec(cmd);
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

function defaultLogCmd(log: (msg: string) => void): (cmd: string) => void {
  return (cmd: string) => log(`  \x1b[2m$ ${cmd}\x1b[0m`);
}

function printDeepCleanSuggestions(log: (msg: string) => void): void {
  log("  Deep clean (run manually if needed):");
  log("    docker system prune -a    Remove all unused images, containers, networks");
  log("    docker volume prune       Remove all unused volumes");
  log("    docker builder prune      Clear build cache");
  log("");
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
