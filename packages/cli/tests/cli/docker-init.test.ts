import { type MockInstance, describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { program } from "../../src/cli/index.js";
import {
  readChapterConfig,
  createDockerPackageJson,
  addInstallLocalScript,
  runDockerInit,
} from "../../src/cli/commands/docker-init.js";

describe("CLI docker-init command", () => {
  it("has the docker-init command registered", () => {
    const cmd = program.commands.find((c) => c.name() === "docker-init");
    expect(cmd).toBeDefined();
    if (cmd) {
      expect(cmd.description()).toContain("Docker");
    }
  });
});

describe("readChapterConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-docker-init-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reads valid chapter.json", () => {
    fs.mkdirSync(path.join(tmpDir, ".clawmasons"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".clawmasons", "chapter.json"),
      JSON.stringify({ chapter: "acme.platform", version: "0.1.0" }),
    );

    const config = readChapterConfig(tmpDir);
    expect(config.chapter).toBe("acme.platform");
    expect(config.version).toBe("0.1.0");
  });

  it("throws when .clawmasons/chapter.json is missing", () => {
    expect(() => readChapterConfig(tmpDir)).toThrow("No .clawmasons/chapter.json found");
  });

  it("throws when chapter.json is invalid JSON", () => {
    fs.mkdirSync(path.join(tmpDir, ".clawmasons"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".clawmasons", "chapter.json"),
      "not json",
    );

    expect(() => readChapterConfig(tmpDir)).toThrow("not valid JSON");
  });

  it("throws when chapter field is missing", () => {
    fs.mkdirSync(path.join(tmpDir, ".clawmasons"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".clawmasons", "chapter.json"),
      JSON.stringify({ version: "0.1.0" }),
    );

    expect(() => readChapterConfig(tmpDir)).toThrow('must contain a "chapter" field');
  });

  it("throws when chapter name is not in lodge.chapter format", () => {
    fs.mkdirSync(path.join(tmpDir, ".clawmasons"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".clawmasons", "chapter.json"),
      JSON.stringify({ chapter: "nodot" }),
    );

    expect(() => readChapterConfig(tmpDir)).toThrow("<lodge>.<chapter> format");
  });

  it("throws when chapter name starts with a dot", () => {
    fs.mkdirSync(path.join(tmpDir, ".clawmasons"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".clawmasons", "chapter.json"),
      JSON.stringify({ chapter: ".bad.name" }),
    );

    expect(() => readChapterConfig(tmpDir)).toThrow("<lodge>.<chapter> format");
  });

  it("throws when chapter name ends with a dot", () => {
    fs.mkdirSync(path.join(tmpDir, ".clawmasons"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".clawmasons", "chapter.json"),
      JSON.stringify({ chapter: "bad.name." }),
    );

    expect(() => readChapterConfig(tmpDir)).toThrow("<lodge>.<chapter> format");
  });
});

describe("createDockerPackageJson", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-docker-init-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates docker/ directory and package.json", () => {
    createDockerPackageJson(tmpDir, "acme.platform");

    const dockerDir = path.join(tmpDir, "docker");
    expect(fs.existsSync(dockerDir)).toBe(true);
    expect(fs.statSync(dockerDir).isDirectory()).toBe(true);

    const pkgJsonPath = path.join(dockerDir, "package.json");
    expect(fs.existsSync(pkgJsonPath)).toBe(true);

    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
    expect(pkg.name).toBe("@acme.platform/docker");
    expect(pkg.private).toBe(true);
    expect(pkg.description).toContain("acme.platform");
  });

  it("overwrites existing docker/package.json", () => {
    fs.mkdirSync(path.join(tmpDir, "docker"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "docker", "package.json"),
      JSON.stringify({ name: "old" }),
    );

    createDockerPackageJson(tmpDir, "acme.platform");

    const pkg = JSON.parse(
      fs.readFileSync(path.join(tmpDir, "docker", "package.json"), "utf-8"),
    );
    expect(pkg.name).toBe("@acme.platform/docker");
  });
});

describe("addInstallLocalScript", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-docker-init-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("adds install-local script to package.json", () => {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "test", scripts: { build: "tsc" } }),
    );

    addInstallLocalScript(tmpDir);

    const pkg = JSON.parse(
      fs.readFileSync(path.join(tmpDir, "package.json"), "utf-8"),
    );
    expect(pkg.scripts["install-local"]).toBe("cd docker && npm install ../dist/*.tgz");
    // Existing scripts preserved
    expect(pkg.scripts.build).toBe("tsc");
  });

  it("creates scripts object if missing", () => {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "test" }),
    );

    addInstallLocalScript(tmpDir);

    const pkg = JSON.parse(
      fs.readFileSync(path.join(tmpDir, "package.json"), "utf-8"),
    );
    expect(pkg.scripts["install-local"]).toBe("cd docker && npm install ../dist/*.tgz");
  });

  it("throws when package.json is missing", () => {
    expect(() => addInstallLocalScript(tmpDir)).toThrow("No package.json found");
  });

  it("overwrites existing install-local script", () => {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "test", scripts: { "install-local": "old" } }),
    );

    addInstallLocalScript(tmpDir);

    const pkg = JSON.parse(
      fs.readFileSync(path.join(tmpDir, "package.json"), "utf-8"),
    );
    expect(pkg.scripts["install-local"]).toBe("cd docker && npm install ../dist/*.tgz");
  });
});

describe("runDockerInit", () => {
  let tmpDir: string;
  let exitSpy: MockInstance;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-docker-init-test-"));
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function setupChapterProject(chapterName: string): void {
    // Create .clawmasons/chapter.json
    fs.mkdirSync(path.join(tmpDir, ".clawmasons"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".clawmasons", "chapter.json"),
      JSON.stringify({ chapter: chapterName, version: "0.1.0" }),
    );

    // Create root package.json
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({
        name: `@${chapterName}/chapter`,
        version: "0.1.0",
        private: true,
        workspaces: ["apps/*", "tasks/*", "skills/*", "roles/*", "agents/*"],
      }),
    );
  }

  it("creates docker/package.json with correct chapter scope", async () => {
    setupChapterProject("acme.platform");

    await runDockerInit(tmpDir, { skipInstall: true });

    expect(exitSpy).not.toHaveBeenCalledWith(1);

    const dockerPkg = JSON.parse(
      fs.readFileSync(path.join(tmpDir, "docker", "package.json"), "utf-8"),
    );
    expect(dockerPkg.name).toBe("@acme.platform/docker");
    expect(dockerPkg.private).toBe(true);
  });

  it("adds install-local script to root package.json", async () => {
    setupChapterProject("acme.platform");

    await runDockerInit(tmpDir, { skipInstall: true });

    expect(exitSpy).not.toHaveBeenCalledWith(1);

    const rootPkg = JSON.parse(
      fs.readFileSync(path.join(tmpDir, "package.json"), "utf-8"),
    );
    expect(rootPkg.scripts["install-local"]).toBe(
      "cd docker && npm install ../dist/*.tgz",
    );
  });

  it("prints chapter name during init", async () => {
    setupChapterProject("myorg.workspace");

    await runDockerInit(tmpDir, { skipInstall: true });

    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).toContain("myorg.workspace");
    expect(logOutput).toContain("docker-init complete");
  });

  it("exits 1 when .clawmasons/chapter.json is missing", async () => {
    // No chapter project setup — just an empty dir
    await runDockerInit(tmpDir, { skipInstall: true });

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("docker-init failed");
    expect(errorOutput).toContain(".clawmasons/chapter.json");
  });

  it("exits 1 when root package.json is missing", async () => {
    // Create chapter.json but no package.json
    fs.mkdirSync(path.join(tmpDir, ".clawmasons"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".clawmasons", "chapter.json"),
      JSON.stringify({ chapter: "acme.platform" }),
    );

    await runDockerInit(tmpDir, { skipInstall: true });

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errorOutput).toContain("docker-init failed");
    expect(errorOutput).toContain("No package.json found");
  });

  it("preserves existing root package.json fields", async () => {
    setupChapterProject("acme.platform");
    // Add an extra field
    const pkgPath = path.join(tmpDir, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    pkg.description = "My chapter project";
    pkg.scripts = { build: "tsc" };
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

    await runDockerInit(tmpDir, { skipInstall: true });

    const updatedPkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    expect(updatedPkg.description).toBe("My chapter project");
    expect(updatedPkg.scripts.build).toBe("tsc");
    expect(updatedPkg.scripts["install-local"]).toBe(
      "cd docker && npm install ../dist/*.tgz",
    );
  });
});
