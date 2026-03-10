import { type MockInstance, describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  runRunInit,
  validateDockerBuildPath,
} from "../../src/cli/commands/run-init.js";

// run-init has been removed as a CLI entry point (REQ-007).
// Command registration removal is verified in build.test.ts.

describe("validateDockerBuildPath", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-run-init-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function setupChapterProject(chapterName: string): string {
    // Create chapter project structure: .clawmasons/chapter.json + docker/package.json
    const chapterProjectDir = path.join(tmpDir, "chapter-project");
    fs.mkdirSync(path.join(chapterProjectDir, ".clawmasons"), { recursive: true });
    fs.writeFileSync(
      path.join(chapterProjectDir, ".clawmasons", "chapter.json"),
      JSON.stringify({ chapter: chapterName, version: "0.1.0" }),
    );
    fs.mkdirSync(path.join(chapterProjectDir, "docker"), { recursive: true });
    fs.writeFileSync(
      path.join(chapterProjectDir, "docker", "package.json"),
      JSON.stringify({ name: `@${chapterName}/docker`, version: "0.0.0", private: true }),
    );
    return path.join(chapterProjectDir, "docker");
  }

  it("returns chapter name for valid docker build path", () => {
    const dockerPath = setupChapterProject("acme.platform");
    const result = validateDockerBuildPath(dockerPath);
    expect(result).toBe("acme.platform");
  });

  it("throws for relative paths", () => {
    expect(() => validateDockerBuildPath("relative/path")).toThrow("absolute path");
  });

  it("throws when docker directory does not exist", () => {
    expect(() => validateDockerBuildPath("/nonexistent/docker")).toThrow("not found");
  });

  it("throws when path is not a directory", () => {
    const filePath = path.join(tmpDir, "not-a-dir");
    fs.writeFileSync(filePath, "");
    expect(() => validateDockerBuildPath(filePath)).toThrow("not a directory");
  });

  it("throws when docker/package.json is missing", () => {
    const dockerDir = path.join(tmpDir, "docker");
    fs.mkdirSync(dockerDir, { recursive: true });
    // No package.json inside
    expect(() => validateDockerBuildPath(dockerDir)).toThrow("No package.json found");
  });

  it("throws when parent directory has no .clawmasons/chapter.json", () => {
    const dockerDir = path.join(tmpDir, "docker");
    fs.mkdirSync(dockerDir, { recursive: true });
    fs.writeFileSync(
      path.join(dockerDir, "package.json"),
      JSON.stringify({ name: "test" }),
    );
    expect(() => validateDockerBuildPath(dockerDir)).toThrow(".clawmasons/chapter.json");
  });
});

describe("runRunInit", () => {
  let tmpDir: string;
  let chapterProjectDir: string;
  let dockerBuildPath: string;
  let exitSpy: MockInstance;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-run-init-test-"));

    // Set up a mock chapter project with docker/ directory
    chapterProjectDir = path.join(tmpDir, "chapter-project");
    fs.mkdirSync(path.join(chapterProjectDir, ".clawmasons"), { recursive: true });
    fs.writeFileSync(
      path.join(chapterProjectDir, ".clawmasons", "chapter.json"),
      JSON.stringify({ chapter: "acme.platform", version: "0.1.0" }),
    );
    fs.mkdirSync(path.join(chapterProjectDir, "docker"), { recursive: true });
    fs.writeFileSync(
      path.join(chapterProjectDir, "docker", "package.json"),
      JSON.stringify({ name: "@acme.platform/docker", version: "0.0.0", private: true }),
    );
    dockerBuildPath = path.join(chapterProjectDir, "docker");

    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates .clawmasons/chapter.json with correct fields", async () => {
    const projectDir = path.join(tmpDir, "my-project");
    fs.mkdirSync(projectDir, { recursive: true });

    await runRunInit(projectDir, {
      promptFn: async () => dockerBuildPath,
    });

    expect(exitSpy).not.toHaveBeenCalledWith(1);

    const configPath = path.join(projectDir, ".clawmasons", "chapter.json");
    expect(fs.existsSync(configPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(config.chapter).toBe("acme.platform");
    expect(config["docker-registries"]).toEqual(["local"]);
    expect(config["docker-build"]).toBe(dockerBuildPath);
  });

  it("creates logs/ subdirectory", async () => {
    const projectDir = path.join(tmpDir, "my-project");
    fs.mkdirSync(projectDir, { recursive: true });

    await runRunInit(projectDir, {
      promptFn: async () => dockerBuildPath,
    });

    const logsDir = path.join(projectDir, ".clawmasons", "logs");
    expect(fs.existsSync(logsDir)).toBe(true);
    expect(fs.statSync(logsDir).isDirectory()).toBe(true);
  });

  it("creates workspace/ subdirectory", async () => {
    const projectDir = path.join(tmpDir, "my-project");
    fs.mkdirSync(projectDir, { recursive: true });

    await runRunInit(projectDir, {
      promptFn: async () => dockerBuildPath,
    });

    const workspaceDir = path.join(projectDir, ".clawmasons", "workspace");
    expect(fs.existsSync(workspaceDir)).toBe(true);
    expect(fs.statSync(workspaceDir).isDirectory()).toBe(true);
  });

  it("docker-build field is an absolute path", async () => {
    const projectDir = path.join(tmpDir, "my-project");
    fs.mkdirSync(projectDir, { recursive: true });

    await runRunInit(projectDir, {
      promptFn: async () => dockerBuildPath,
    });

    const config = JSON.parse(
      fs.readFileSync(path.join(projectDir, ".clawmasons", "chapter.json"), "utf-8"),
    );
    expect(path.isAbsolute(config["docker-build"])).toBe(true);
  });

  it("prints chapter name and docker build path", async () => {
    const projectDir = path.join(tmpDir, "my-project");
    fs.mkdirSync(projectDir, { recursive: true });

    await runRunInit(projectDir, {
      promptFn: async () => dockerBuildPath,
    });

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("acme.platform");
    expect(logOutput).toContain(dockerBuildPath);
    expect(logOutput).toContain("run-init complete");
  });

  it("prints created file list", async () => {
    const projectDir = path.join(tmpDir, "my-project");
    fs.mkdirSync(projectDir, { recursive: true });

    await runRunInit(projectDir, {
      promptFn: async () => dockerBuildPath,
    });

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain(".clawmasons/chapter.json");
    expect(logOutput).toContain(".clawmasons/logs/");
    expect(logOutput).toContain(".clawmasons/workspace/");
  });

  // ── Idempotency ────────────────────────────────────────────────────

  it("does not overwrite existing chapter.json", async () => {
    const projectDir = path.join(tmpDir, "my-project");
    fs.mkdirSync(path.join(projectDir, ".clawmasons"), { recursive: true });

    // Write an existing config
    const existingConfig = {
      chapter: "existing.chapter",
      "docker-registries": ["local"],
      "docker-build": "/some/other/path",
    };
    fs.writeFileSync(
      path.join(projectDir, ".clawmasons", "chapter.json"),
      JSON.stringify(existingConfig, null, 2),
    );

    await runRunInit(projectDir, {
      promptFn: async () => dockerBuildPath,
    });

    // Config should be untouched
    const config = JSON.parse(
      fs.readFileSync(path.join(projectDir, ".clawmasons", "chapter.json"), "utf-8"),
    );
    expect(config.chapter).toBe("existing.chapter");
    expect(config["docker-build"]).toBe("/some/other/path");
  });

  it("preserves existing sessions directory", async () => {
    const projectDir = path.join(tmpDir, "my-project");
    const sessionsDir = path.join(projectDir, ".clawmasons", "sessions", "abc123", "docker");
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionsDir, "docker-compose.yml"),
      "version: '3'\n",
    );

    // Write existing config to trigger idempotent path
    fs.writeFileSync(
      path.join(projectDir, ".clawmasons", "chapter.json"),
      JSON.stringify({ chapter: "acme.platform", "docker-registries": ["local"], "docker-build": dockerBuildPath }),
    );

    await runRunInit(projectDir, {
      promptFn: async () => dockerBuildPath,
    });

    // Session files should still be there
    expect(fs.existsSync(path.join(sessionsDir, "docker-compose.yml"))).toBe(true);
  });

  it("ensures logs/ and workspace/ exist on idempotent re-run", async () => {
    const projectDir = path.join(tmpDir, "my-project");
    fs.mkdirSync(path.join(projectDir, ".clawmasons"), { recursive: true });

    // Write existing config but WITHOUT logs/ and workspace/
    fs.writeFileSync(
      path.join(projectDir, ".clawmasons", "chapter.json"),
      JSON.stringify({ chapter: "acme.platform" }),
    );

    await runRunInit(projectDir, {
      promptFn: async () => dockerBuildPath,
    });

    expect(fs.existsSync(path.join(projectDir, ".clawmasons", "logs"))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, ".clawmasons", "workspace"))).toBe(true);
  });

  it("prints idempotent message when config exists", async () => {
    const projectDir = path.join(tmpDir, "my-project");
    fs.mkdirSync(path.join(projectDir, ".clawmasons"), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, ".clawmasons", "chapter.json"),
      JSON.stringify({ chapter: "acme.platform" }),
    );

    await runRunInit(projectDir, {
      promptFn: async () => dockerBuildPath,
    });

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("already exists");
    expect(logOutput).toContain("Preserving existing configuration");
  });

  // ── Error Cases ────────────────────────────────────────────────────

  it("exits 1 when no docker build path provided", async () => {
    const projectDir = path.join(tmpDir, "my-project");
    fs.mkdirSync(projectDir, { recursive: true });

    await runRunInit(projectDir, {
      promptFn: async () => "",
    });

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("run-init failed");
    expect(errorOutput).toContain("No docker build path provided");
  });

  it("exits 1 when docker build path is invalid", async () => {
    const projectDir = path.join(tmpDir, "my-project");
    fs.mkdirSync(projectDir, { recursive: true });

    await runRunInit(projectDir, {
      promptFn: async () => "/nonexistent/docker",
    });

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("run-init failed");
  });

  it("exits 1 when docker build path is relative", async () => {
    const projectDir = path.join(tmpDir, "my-project");
    fs.mkdirSync(projectDir, { recursive: true });

    await runRunInit(projectDir, {
      promptFn: async () => "relative/path",
    });

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("run-init failed");
    expect(errorOutput).toContain("absolute path");
  });

  it("exits 1 when chapter project config is missing", async () => {
    const projectDir = path.join(tmpDir, "my-project");
    fs.mkdirSync(projectDir, { recursive: true });

    // Create a docker dir without a parent chapter config
    const badDockerDir = path.join(tmpDir, "bad-chapter", "docker");
    fs.mkdirSync(badDockerDir, { recursive: true });
    fs.writeFileSync(
      path.join(badDockerDir, "package.json"),
      JSON.stringify({ name: "test" }),
    );

    await runRunInit(projectDir, {
      promptFn: async () => badDockerDir,
    });

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("run-init failed");
  });
});
