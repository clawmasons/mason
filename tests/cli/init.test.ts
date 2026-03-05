import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runInit } from "../../src/cli/commands/init.js";

describe("forge init", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-test-"));
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("init in empty directory", () => {
    it("creates all workspace directories", async () => {
      await runInit(tmpDir, {});

      const expectedDirs = ["apps", "tasks", "skills", "roles", "agents", ".forge"];
      for (const dir of expectedDirs) {
        const stat = fs.statSync(path.join(tmpDir, dir));
        expect(stat.isDirectory()).toBe(true);
      }
    });

    it("creates package.json with correct content", async () => {
      await runInit(tmpDir, {});

      const pkgPath = path.join(tmpDir, "package.json");
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      expect(pkg.private).toBe(true);
      expect(pkg.version).toBe("0.1.0");
      expect(pkg.workspaces).toEqual([
        "apps/*",
        "tasks/*",
        "skills/*",
        "roles/*",
        "agents/*",
      ]);
    });

    it("defaults package name to directory name", async () => {
      await runInit(tmpDir, {});

      const pkgPath = path.join(tmpDir, "package.json");
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      expect(pkg.name).toBe(path.basename(tmpDir));
    });

    it("creates .forge/config.json with defaults", async () => {
      await runInit(tmpDir, {});

      const configPath = path.join(tmpDir, ".forge", "config.json");
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      expect(config).toEqual({ version: "0.1.0" });
    });

    it("creates .forge/.env.example with credential placeholders", async () => {
      await runInit(tmpDir, {});

      const envPath = path.join(tmpDir, ".forge", ".env.example");
      const content = fs.readFileSync(envPath, "utf-8");
      expect(content).toContain("GITHUB_TOKEN");
      expect(content).toContain("ANTHROPIC_API_KEY");
    });

    it("creates .gitignore with standard entries", async () => {
      await runInit(tmpDir, {});

      const gitignorePath = path.join(tmpDir, ".gitignore");
      const content = fs.readFileSync(gitignorePath, "utf-8");
      expect(content).toContain("node_modules/");
      expect(content).toContain(".env");
      expect(content).toContain("dist/");
      expect(content).toContain(".forge/.env");
    });

    it("prints success output with created files", async () => {
      await runInit(tmpDir, {});

      const logCalls = vi.mocked(console.log).mock.calls.flat().join("\n");
      expect(logCalls).toContain("forge workspace initialized");
      expect(logCalls).toContain("Created:");
      expect(logCalls).toContain("Next steps:");
    });
  });

  describe("--name flag", () => {
    it("sets package name from --name flag", async () => {
      await runInit(tmpDir, { name: "@myorg/agent-workspace" });

      const pkgPath = path.join(tmpDir, "package.json");
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      expect(pkg.name).toBe("@myorg/agent-workspace");
    });

    it("sets custom name from --name flag", async () => {
      await runInit(tmpDir, { name: "my-custom-name" });

      const pkgPath = path.join(tmpDir, "package.json");
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      expect(pkg.name).toBe("my-custom-name");
    });
  });

  describe("idempotency", () => {
    it("warns and exits if .forge/ directory already exists", async () => {
      // Create .forge directory to simulate existing workspace
      fs.mkdirSync(path.join(tmpDir, ".forge"), { recursive: true });

      await runInit(tmpDir, {});

      const logCalls = vi.mocked(console.log).mock.calls.flat().join("\n");
      expect(logCalls).toContain("already initialized");

      // Should NOT create package.json (no new files created)
      expect(fs.existsSync(path.join(tmpDir, "package.json"))).toBe(false);
    });

    it("does not modify existing files when workspace exists", async () => {
      // Create .forge directory and a config file
      fs.mkdirSync(path.join(tmpDir, ".forge"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, ".forge", "config.json"),
        '{"version":"0.0.1"}',
      );

      await runInit(tmpDir, {});

      // Config should be untouched
      const config = JSON.parse(
        fs.readFileSync(path.join(tmpDir, ".forge", "config.json"), "utf-8"),
      );
      expect(config.version).toBe("0.0.1");
    });
  });

  describe("existing package.json", () => {
    it("does not overwrite existing package.json", async () => {
      const existingPkg = { name: "existing-project", version: "2.0.0" };
      fs.writeFileSync(
        path.join(tmpDir, "package.json"),
        JSON.stringify(existingPkg),
      );

      await runInit(tmpDir, {});

      const pkg = JSON.parse(
        fs.readFileSync(path.join(tmpDir, "package.json"), "utf-8"),
      );
      expect(pkg.name).toBe("existing-project");
      expect(pkg.version).toBe("2.0.0");
      expect(pkg.workspaces).toBeUndefined();
    });

    it("warns user to add workspaces manually", async () => {
      fs.writeFileSync(
        path.join(tmpDir, "package.json"),
        JSON.stringify({ name: "existing" }),
      );

      await runInit(tmpDir, {});

      const logCalls = vi.mocked(console.log).mock.calls.flat().join("\n");
      expect(logCalls).toContain("package.json already exists");
      expect(logCalls).toContain("workspaces");
    });
  });

  describe("existing .gitignore", () => {
    it("does not overwrite existing .gitignore", async () => {
      const existingContent = "# my custom gitignore\n*.log\n";
      fs.writeFileSync(path.join(tmpDir, ".gitignore"), existingContent);

      await runInit(tmpDir, {});

      const content = fs.readFileSync(
        path.join(tmpDir, ".gitignore"),
        "utf-8",
      );
      expect(content).toBe(existingContent);
    });

    it("warns that .gitignore was skipped", async () => {
      fs.writeFileSync(path.join(tmpDir, ".gitignore"), "*.log\n");

      await runInit(tmpDir, {});

      const logCalls = vi.mocked(console.log).mock.calls.flat().join("\n");
      expect(logCalls).toContain(".gitignore already exists");
    });
  });
});
