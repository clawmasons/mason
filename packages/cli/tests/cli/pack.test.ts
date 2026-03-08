import { type MockInstance, describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { program } from "../../src/cli/index.js";

describe("CLI pack command", () => {
  it("has the pack command registered", () => {
    const cmd = program.commands.find((c) => c.name() === "pack");
    expect(cmd).toBeDefined();
    if (cmd) {
      expect(cmd.description()).toContain("pack");
    }
  });
});

describe("runPack", () => {
  let tmpDir: string;
  let exitSpy: MockInstance;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  // Dynamic import to allow mocking
  let runPack: (rootDir: string) => Promise<void>;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-pack-test-"));
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mod = await import("../../src/cli/commands/pack.js");
    runPack = mod.runPack;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("exits with error when no package.json found", async () => {
    await runPack(tmpDir);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("Pack failed");
    expect(errorOutput).toContain("No package.json found");
  });

  it("exits with error when no workspace packages found", async () => {
    // Create root package.json but no packages/ directory
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "test", workspaces: ["packages/*"] }),
    );

    await runPack(tmpDir);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("Pack failed");
    expect(errorOutput).toContain("No workspace packages found");
  });

  it("cleans existing tgz files from dist/", async () => {
    // Setup: root package.json + packages dir + a stale tgz
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "test", workspaces: ["packages/*"], scripts: { build: "echo ok" } }),
    );

    const packagesDir = path.join(tmpDir, "packages", "shared");
    fs.mkdirSync(packagesDir, { recursive: true });
    fs.writeFileSync(
      path.join(packagesDir, "package.json"),
      JSON.stringify({ name: "@test/shared", version: "1.0.0" }),
    );

    // Create stale tgz
    const distDir = path.join(tmpDir, "dist");
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(path.join(distDir, "old-pkg-1.0.0.tgz"), "stale");

    // runPack will try to exec npm which will fail in test environment,
    // but the stale tgz should be cleaned before that
    await runPack(tmpDir);

    // The old tgz should have been removed (even though build will fail)
    expect(fs.existsSync(path.join(distDir, "old-pkg-1.0.0.tgz"))).toBe(false);
  });

  it("creates dist/ directory if missing", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "test", workspaces: ["packages/*"], scripts: { build: "echo ok" } }),
    );

    const packagesDir = path.join(tmpDir, "packages", "shared");
    fs.mkdirSync(packagesDir, { recursive: true });
    fs.writeFileSync(
      path.join(packagesDir, "package.json"),
      JSON.stringify({ name: "@test/shared", version: "1.0.0" }),
    );

    // runPack will fail at build step, but dist/ should be created
    await runPack(tmpDir);

    expect(fs.existsSync(path.join(tmpDir, "dist"))).toBe(true);
  });

  it("discovers workspace packages from packages/*", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "test", workspaces: ["packages/*"], scripts: { build: "echo ok" } }),
    );

    // Create multiple workspace packages
    for (const name of ["shared", "cli", "proxy"]) {
      const pkgDir = path.join(tmpDir, "packages", name);
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(
        path.join(pkgDir, "package.json"),
        JSON.stringify({ name: `@test/${name}`, version: "1.0.0" }),
      );
    }

    await runPack(tmpDir);

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("3 workspace package(s)");
    expect(logOutput).toContain("@test/shared");
    expect(logOutput).toContain("@test/cli");
    expect(logOutput).toContain("@test/proxy");
  });
});
