import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runDoctor, quickAutoCleanup, type DoctorDeps } from "../../src/cli/commands/doctor.js";

// Helpers to build mock deps
function makeDeps(overrides: Partial<DoctorDeps> = {}): DoctorDeps {
  return {
    execSyncFn: overrides.execSyncFn ?? (() => ""),
    readdirSyncFn: overrides.readdirSyncFn ?? (() => []),
    existsSyncFn: overrides.existsSyncFn ?? (() => false),
    rmSyncFn: overrides.rmSyncFn ?? (() => {}),
    confirmFn: overrides.confirmFn ?? (async () => true),
    logFn: overrides.logFn ?? (() => {}),
  };
}

describe("runDoctor", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mason-doctor-test-"));
  });

  it("exits early with clean message when no issues found", async () => {
    const logs: string[] = [];
    const deps = makeDeps({
      logFn: (msg) => logs.push(msg),
    });

    await runDoctor(tmpDir, { quick: true, auto: true }, deps);

    expect(logs.some((l) => l.includes("clean"))).toBe(true);
  });

  it("reports stopped containers in quick mode", async () => {
    const logs: string[] = [];
    const deps = makeDeps({
      execSyncFn: (cmd: string) => {
        if (cmd.includes("docker info")) return "ok";
        if (cmd.includes('status=exited')) return "abc123 mason-writer-agent";
        if (cmd.includes("dangling=true")) return "";
        if (cmd.includes("docker compose ls")) return "[]";
        if (cmd.includes("docker rm")) return "";
        return "";
      },
      logFn: (msg) => logs.push(msg),
    });

    await runDoctor(tmpDir, { quick: true, auto: true }, deps);

    expect(logs.some((l) => l.includes("Stopped containers: 1"))).toBe(true);
  });

  it("reports dangling images", async () => {
    const logs: string[] = [];
    const deps = makeDeps({
      execSyncFn: (cmd: string) => {
        if (cmd.includes("docker info")) return "ok";
        if (cmd.includes('status=exited')) return "";
        if (cmd.includes("dangling=true")) return "sha256:abc <none>:<none>";
        if (cmd.includes("docker compose ls")) return "[]";
        if (cmd.includes("docker image prune")) return "";
        return "";
      },
      logFn: (msg) => logs.push(msg),
    });

    await runDoctor(tmpDir, { quick: true, auto: true }, deps);

    expect(logs.some((l) => l.includes("Dangling images: 1"))).toBe(true);
  });

  it("reports orphaned sessions", async () => {
    const logs: string[] = [];
    const sessionsDir = path.join(tmpDir, ".mason", "sessions");
    const sessionId = "deadbeef";
    const sessionDir = path.join(sessionsDir, sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, "docker-compose.yaml"), "version: '3'");

    const rmSpy = vi.fn();
    const deps = makeDeps({
      execSyncFn: (cmd: string) => {
        if (cmd.includes("docker info")) return "ok";
        if (cmd.includes('status=exited')) return "";
        if (cmd.includes("dangling=true")) return "";
        if (cmd.includes("docker compose ls")) return "[]";
        return "";
      },
      existsSyncFn: fs.existsSync,
      readdirSyncFn: (p: string) => fs.readdirSync(p),
      rmSyncFn: rmSpy,
      logFn: (msg) => logs.push(msg),
    });

    await runDoctor(tmpDir, { quick: true, auto: true }, deps);

    expect(logs.some((l) => l.includes("Orphaned sessions: 1"))).toBe(true);
    expect(rmSpy).toHaveBeenCalled();
  });

  it("skips cleanup when user declines confirmation", async () => {
    const logs: string[] = [];
    const rmSpy = vi.fn();
    const deps = makeDeps({
      execSyncFn: (cmd: string) => {
        if (cmd.includes("docker info")) return "ok";
        if (cmd.includes('status=exited')) return "abc123 mason-writer-agent";
        if (cmd.includes("dangling=true")) return "";
        if (cmd.includes("docker compose ls")) return "[]";
        return "";
      },
      confirmFn: async () => false,
      rmSyncFn: rmSpy,
      logFn: (msg) => logs.push(msg),
    });

    await runDoctor(tmpDir, { quick: true }, deps);

    expect(logs.some((l) => l.includes("skipped"))).toBe(true);
    expect(rmSpy).not.toHaveBeenCalled();
  });

  it("full mode scans volumes and networks", async () => {
    const logs: string[] = [];
    const deps = makeDeps({
      execSyncFn: (cmd: string) => {
        if (cmd.includes("docker info")) return "ok";
        if (cmd.includes('status=exited')) return "";
        if (cmd.includes('status=running')) return "";
        if (cmd.includes("dangling=true") && cmd.includes("images")) return "";
        if (cmd.includes("dangling=true") && cmd.includes("volume")) return "mason-ignore-node-modules";
        if (cmd.includes("network ls")) return "abc123 mason-default";
        if (cmd.includes("docker compose ls")) return "[]";
        if (cmd.includes("docker system df")) return "TYPE  TOTAL  ACTIVE  SIZE  RECLAIMABLE";
        if (cmd.includes("docker volume rm")) return "";
        if (cmd.includes("docker network rm")) return "";
        return "";
      },
      logFn: (msg) => logs.push(msg),
    });

    await runDoctor(tmpDir, { auto: true }, deps);

    expect(logs.some((l) => l.includes("Unused volumes: 1"))).toBe(true);
    expect(logs.some((l) => l.includes("Unused networks: 1"))).toBe(true);
  });

  it("reports and force-removes stuck containers", async () => {
    const logs: string[] = [];
    const removedContainers: string[] = [];
    const deps = makeDeps({
      execSyncFn: (cmd: string) => {
        if (cmd.includes("docker info")) return "ok";
        if (cmd.includes('status=exited')) return "";
        if (cmd.includes('status=created')) return "def456 mason-proxy-project";
        if (cmd.includes("dangling=true")) return "";
        if (cmd.includes("docker compose ls")) return "[]";
        if (cmd.includes("docker rm")) {
          removedContainers.push(cmd);
          return "";
        }
        return "";
      },
      logFn: (msg) => logs.push(msg),
    });

    await runDoctor(tmpDir, { quick: true, auto: true }, deps);

    expect(logs.some((l) => l.includes("Stuck containers (never started): 1"))).toBe(true);
    expect(removedContainers.length).toBe(1);
    expect(removedContainers[0]).toContain("docker rm -f");
  });

  it("quick mode does NOT scan volumes or networks", async () => {
    const logs: string[] = [];
    const deps = makeDeps({
      execSyncFn: (cmd: string) => {
        if (cmd.includes("docker info")) return "ok";
        if (cmd.includes('status=exited')) return "";
        if (cmd.includes("dangling=true")) return "";
        if (cmd.includes("docker compose ls")) return "[]";
        return "";
      },
      logFn: (msg) => logs.push(msg),
    });

    await runDoctor(tmpDir, { quick: true, auto: true }, deps);

    expect(logs.every((l) => !l.includes("volume"))).toBe(true);
    expect(logs.every((l) => !l.includes("network"))).toBe(true);
  });
});

describe("quickAutoCleanup", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mason-qac-test-"));
  });

  it("runs silently and removes stopped containers", async () => {
    const removedContainers: string[] = [];
    const deps = makeDeps({
      execSyncFn: (cmd: string) => {
        if (cmd.includes("docker info")) return "ok";
        if (cmd.includes('status=exited')) return "abc123 mason-writer-agent";
        if (cmd.includes("dangling=true")) return "";
        if (cmd.includes("docker compose ls")) return "[]";
        if (cmd.includes("docker rm")) {
          removedContainers.push(cmd);
          return "";
        }
        return "";
      },
    });

    await quickAutoCleanup(tmpDir, deps);

    expect(removedContainers.length).toBe(1);
  });

  it("force-removes stuck containers", async () => {
    const removedContainers: string[] = [];
    const deps = makeDeps({
      execSyncFn: (cmd: string) => {
        if (cmd.includes("docker info")) return "ok";
        if (cmd.includes('status=exited')) return "";
        if (cmd.includes('status=created')) return "def456 mason-proxy-project";
        if (cmd.includes("dangling=true")) return "";
        if (cmd.includes("docker compose ls")) return "[]";
        if (cmd.includes("docker rm")) {
          removedContainers.push(cmd);
          return "";
        }
        return "";
      },
    });

    await quickAutoCleanup(tmpDir, deps);

    expect(removedContainers.length).toBe(1);
    expect(removedContainers[0]).toContain("docker rm -f");
  });

  it("does nothing when Docker is unavailable", async () => {
    const commands: string[] = [];
    const deps = makeDeps({
      execSyncFn: (cmd: string) => {
        commands.push(cmd);
        if (cmd.includes("docker info")) throw new Error("Docker not running");
        return "";
      },
    });

    await quickAutoCleanup(tmpDir, deps);

    // Only the docker info check should have been called
    expect(commands.length).toBe(1);
  });

  it("does nothing when system is clean", async () => {
    const commands: string[] = [];
    const deps = makeDeps({
      execSyncFn: (cmd: string) => {
        commands.push(cmd);
        if (cmd.includes("docker info")) return "ok";
        if (cmd.includes("docker compose ls")) return "[]";
        return "";
      },
    });

    await quickAutoCleanup(tmpDir, deps);

    // No cleanup commands should have been issued (only scan commands)
    expect(commands.every((c) => !c.includes("docker rm") && !c.includes("prune"))).toBe(true);
  });
});
