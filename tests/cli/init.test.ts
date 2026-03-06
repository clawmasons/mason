import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  runInit,
  listTemplates,
  deriveProjectScope,
  copyTemplateFiles,
} from "../../src/cli/commands/init.js";

describe("forge init", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-test-"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("init in empty directory", () => {
    it("creates all workspace directories", async () => {
      await runInit(tmpDir, {}, { skipNpmInstall: true });

      const expectedDirs = ["apps", "tasks", "skills", "roles", "agents", ".forge"];
      for (const dir of expectedDirs) {
        const stat = fs.statSync(path.join(tmpDir, dir));
        expect(stat.isDirectory()).toBe(true);
      }
    });

    it("creates package.json with correct content", async () => {
      await runInit(tmpDir, {}, { skipNpmInstall: true });

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
      await runInit(tmpDir, {}, { skipNpmInstall: true });

      const pkgPath = path.join(tmpDir, "package.json");
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      expect(pkg.name).toBe(path.basename(tmpDir));
    });

    it("creates .forge/config.json with defaults", async () => {
      await runInit(tmpDir, {}, { skipNpmInstall: true });

      const configPath = path.join(tmpDir, ".forge", "config.json");
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      expect(config).toEqual({ version: "0.1.0" });
    });

    it("creates .forge/.env.example with credential placeholders", async () => {
      await runInit(tmpDir, {}, { skipNpmInstall: true });

      const envPath = path.join(tmpDir, ".forge", ".env.example");
      const content = fs.readFileSync(envPath, "utf-8");
      expect(content).toContain("GITHUB_TOKEN");
      expect(content).toContain("ANTHROPIC_API_KEY");
    });

    it("creates .gitignore with standard entries", async () => {
      await runInit(tmpDir, {}, { skipNpmInstall: true });

      const gitignorePath = path.join(tmpDir, ".gitignore");
      const content = fs.readFileSync(gitignorePath, "utf-8");
      expect(content).toContain("node_modules/");
      expect(content).toContain(".env");
      expect(content).toContain("dist/");
      expect(content).toContain(".forge/.env");
    });

    it("prints success output with created files", async () => {
      await runInit(tmpDir, {}, { skipNpmInstall: true });

      const logCalls = vi.mocked(console.log).mock.calls.flat().join("\n");
      expect(logCalls).toContain("forge workspace initialized");
      expect(logCalls).toContain("Created:");
      expect(logCalls).toContain("Next steps:");
    });
  });

  describe("--name flag", () => {
    it("sets package name from --name flag", async () => {
      await runInit(tmpDir, { name: "@myorg/agent-workspace" }, { skipNpmInstall: true });

      const pkgPath = path.join(tmpDir, "package.json");
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      expect(pkg.name).toBe("@myorg/agent-workspace");
    });

    it("sets custom name from --name flag", async () => {
      await runInit(tmpDir, { name: "my-custom-name" }, { skipNpmInstall: true });

      const pkgPath = path.join(tmpDir, "package.json");
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      expect(pkg.name).toBe("my-custom-name");
    });
  });

  describe("idempotency", () => {
    it("warns and exits if .forge/ directory already exists", async () => {
      // Create .forge directory to simulate existing workspace
      fs.mkdirSync(path.join(tmpDir, ".forge"), { recursive: true });

      await runInit(tmpDir, {}, { skipNpmInstall: true });

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

      await runInit(tmpDir, {}, { skipNpmInstall: true });

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

      await runInit(tmpDir, {}, { skipNpmInstall: true });

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

      await runInit(tmpDir, {}, { skipNpmInstall: true });

      const logCalls = vi.mocked(console.log).mock.calls.flat().join("\n");
      expect(logCalls).toContain("package.json already exists");
      expect(logCalls).toContain("workspaces");
    });
  });

  describe("existing .gitignore", () => {
    it("does not overwrite existing .gitignore", async () => {
      const existingContent = "# my custom gitignore\n*.log\n";
      fs.writeFileSync(path.join(tmpDir, ".gitignore"), existingContent);

      await runInit(tmpDir, {}, { skipNpmInstall: true });

      const content = fs.readFileSync(
        path.join(tmpDir, ".gitignore"),
        "utf-8",
      );
      expect(content).toBe(existingContent);
    });

    it("warns that .gitignore was skipped", async () => {
      fs.writeFileSync(path.join(tmpDir, ".gitignore"), "*.log\n");

      await runInit(tmpDir, {}, { skipNpmInstall: true });

      const logCalls = vi.mocked(console.log).mock.calls.flat().join("\n");
      expect(logCalls).toContain(".gitignore already exists");
    });
  });

  describe("--template flag", () => {
    let templatesDir: string;

    beforeEach(() => {
      // Create a test templates directory with a "test-template" template
      templatesDir = path.join(tmpDir, "__templates__");
      const templateDir = path.join(templatesDir, "test-template");
      fs.mkdirSync(path.join(templateDir, "agents", "note-taker"), {
        recursive: true,
      });
      fs.mkdirSync(path.join(templateDir, "roles", "writer"), {
        recursive: true,
      });

      // Template root package.json with placeholders
      fs.writeFileSync(
        path.join(templateDir, "package.json"),
        JSON.stringify(
          {
            name: "{{projectName}}",
            version: "0.1.0",
            private: true,
            workspaces: ["apps/*", "tasks/*", "skills/*", "roles/*", "agents/*"],
            dependencies: { "@clawmasons/forge-core": "^0.1.0" },
          },
          null,
          2,
        ),
      );

      // Template agent package.json
      fs.writeFileSync(
        path.join(templateDir, "agents", "note-taker", "package.json"),
        JSON.stringify(
          {
            name: "@{{projectScope}}/agent-note-taker",
            version: "1.0.0",
            forge: {
              type: "agent",
              roles: ["@{{projectScope}}/role-writer"],
            },
          },
          null,
          2,
        ),
      );

      // Template role package.json
      fs.writeFileSync(
        path.join(templateDir, "roles", "writer", "package.json"),
        JSON.stringify(
          {
            name: "@{{projectScope}}/role-writer",
            version: "1.0.0",
            forge: {
              type: "role",
              tasks: ["@clawmasons/task-take-notes"],
              skills: ["@clawmasons/skill-markdown-conventions"],
              permissions: {
                "@clawmasons/app-filesystem": {
                  allow: ["read_file", "write_file"],
                  deny: [],
                },
              },
            },
          },
          null,
          2,
        ),
      );
    });

    it("copies template files to target directory", async () => {
      const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-init-tmpl-"));
      try {
        await runInit(
          targetDir,
          { template: "test-template" },
          { templatesDir, skipNpmInstall: true },
        );

        expect(fs.existsSync(path.join(targetDir, "package.json"))).toBe(true);
        expect(
          fs.existsSync(
            path.join(targetDir, "agents", "note-taker", "package.json"),
          ),
        ).toBe(true);
        expect(
          fs.existsSync(
            path.join(targetDir, "roles", "writer", "package.json"),
          ),
        ).toBe(true);
      } finally {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
    });

    it("replaces {{projectName}} with directory name in package.json", async () => {
      const targetDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "test-forge-"),
      );
      try {
        await runInit(
          targetDir,
          { template: "test-template" },
          { templatesDir, skipNpmInstall: true },
        );

        const pkg = JSON.parse(
          fs.readFileSync(path.join(targetDir, "package.json"), "utf-8"),
        );
        expect(pkg.name).toBe(path.basename(targetDir));
      } finally {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
    });

    it("replaces {{projectScope}} in component package.json files", async () => {
      const targetDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "test-forge-"),
      );
      try {
        await runInit(
          targetDir,
          { template: "test-template" },
          { templatesDir, skipNpmInstall: true },
        );

        const dirName = path.basename(targetDir);
        const agentPkg = JSON.parse(
          fs.readFileSync(
            path.join(targetDir, "agents", "note-taker", "package.json"),
            "utf-8",
          ),
        );
        expect(agentPkg.name).toBe(`@${dirName}/agent-note-taker`);
        expect(agentPkg.forge.roles).toEqual([`@${dirName}/role-writer`]);

        const rolePkg = JSON.parse(
          fs.readFileSync(
            path.join(targetDir, "roles", "writer", "package.json"),
            "utf-8",
          ),
        );
        expect(rolePkg.name).toBe(`@${dirName}/role-writer`);
        // forge-core references should remain unchanged
        expect(rolePkg.forge.tasks).toEqual(["@clawmasons/task-take-notes"]);
      } finally {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
    });

    it("uses --name to scope local components", async () => {
      const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-init-"));
      try {
        await runInit(
          targetDir,
          { template: "test-template", name: "@acme/my-agent" },
          { templatesDir, skipNpmInstall: true },
        );

        const pkg = JSON.parse(
          fs.readFileSync(path.join(targetDir, "package.json"), "utf-8"),
        );
        expect(pkg.name).toBe("@acme/my-agent");

        const agentPkg = JSON.parse(
          fs.readFileSync(
            path.join(targetDir, "agents", "note-taker", "package.json"),
            "utf-8",
          ),
        );
        expect(agentPkg.name).toBe("@acme/agent-note-taker");
        expect(agentPkg.forge.roles).toEqual(["@acme/role-writer"]);
      } finally {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
    });

    it("shows error for unknown template", async () => {
      const exitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(() => undefined as never);

      await runInit(
        tmpDir,
        { template: "nonexistent" },
        { templatesDir, skipNpmInstall: true },
      );

      const errorCalls = vi
        .mocked(console.error)
        .mock.calls.flat()
        .join("\n");
      expect(errorCalls).toContain('Unknown template "nonexistent"');
      expect(errorCalls).toContain("test-template");
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
    });

    it("creates forge scaffold after copying template files", async () => {
      const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-init-"));
      try {
        await runInit(
          targetDir,
          { template: "test-template" },
          { templatesDir, skipNpmInstall: true },
        );

        // Forge scaffold should exist
        expect(
          fs.existsSync(path.join(targetDir, ".forge", "config.json")),
        ).toBe(true);
        expect(
          fs.existsSync(path.join(targetDir, ".forge", ".env.example")),
        ).toBe(true);
        expect(fs.existsSync(path.join(targetDir, ".gitignore"))).toBe(true);
      } finally {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
    });

    it("shows template-specific next steps", async () => {
      const targetDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "test-forge-"),
      );
      try {
        await runInit(
          targetDir,
          { template: "test-template" },
          { templatesDir, skipNpmInstall: true },
        );

        const dirName = path.basename(targetDir);
        const logCalls = vi.mocked(console.log).mock.calls.flat().join("\n");
        expect(logCalls).toContain("Template: test-template");
        expect(logCalls).toContain(`forge validate @${dirName}/agent-note-taker`);
        expect(logCalls).toContain("forge list");
      } finally {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
    });
  });

  describe("template listing", () => {
    it("lists available templates when no --template specified", async () => {
      const templatesDir = path.join(tmpDir, "__templates__");
      fs.mkdirSync(path.join(templatesDir, "note-taker"), { recursive: true });
      fs.mkdirSync(path.join(templatesDir, "chatbot"), { recursive: true });

      const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-init-"));
      try {
        await runInit(
          targetDir,
          {},
          { templatesDir, skipNpmInstall: true },
        );

        const logCalls = vi.mocked(console.log).mock.calls.flat().join("\n");
        expect(logCalls).toContain("Available templates:");
        expect(logCalls).toContain("note-taker");
        expect(logCalls).toContain("chatbot");
        expect(logCalls).toContain("--template <name>");
      } finally {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
    });

    it("does not list templates when templates dir is empty", async () => {
      const templatesDir = path.join(tmpDir, "__templates__");
      fs.mkdirSync(templatesDir, { recursive: true });

      const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-init-"));
      try {
        await runInit(
          targetDir,
          {},
          { templatesDir, skipNpmInstall: true },
        );

        const logCalls = vi.mocked(console.log).mock.calls.flat().join("\n");
        expect(logCalls).not.toContain("Available templates:");
      } finally {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
    });
  });
});

describe("deriveProjectScope", () => {
  it("extracts scope from scoped package name", () => {
    expect(deriveProjectScope("@acme/my-agent")).toBe("acme");
    expect(deriveProjectScope("@myorg/cool-project")).toBe("myorg");
  });

  it("returns name as-is for unscoped names", () => {
    expect(deriveProjectScope("test-forge")).toBe("test-forge");
    expect(deriveProjectScope("my-project")).toBe("my-project");
  });

  it("handles edge cases", () => {
    expect(deriveProjectScope("@scope/name")).toBe("scope");
    expect(deriveProjectScope("simple")).toBe("simple");
  });
});

describe("listTemplates", () => {
  let templatesDir: string;

  beforeEach(() => {
    templatesDir = fs.mkdtempSync(path.join(os.tmpdir(), "templates-"));
  });

  afterEach(() => {
    fs.rmSync(templatesDir, { recursive: true, force: true });
  });

  it("returns directory names", () => {
    fs.mkdirSync(path.join(templatesDir, "note-taker"));
    fs.mkdirSync(path.join(templatesDir, "chatbot"));
    fs.writeFileSync(path.join(templatesDir, "README.md"), "");

    const templates = listTemplates(templatesDir);
    expect(templates).toContain("note-taker");
    expect(templates).toContain("chatbot");
    expect(templates).not.toContain("README.md");
  });

  it("returns empty array for nonexistent directory", () => {
    expect(listTemplates("/nonexistent")).toEqual([]);
  });

  it("returns empty array for empty directory", () => {
    expect(listTemplates(templatesDir)).toEqual([]);
  });
});

describe("copyTemplateFiles", () => {
  let srcDir: string;
  let destDir: string;

  beforeEach(() => {
    srcDir = fs.mkdtempSync(path.join(os.tmpdir(), "src-tmpl-"));
    destDir = fs.mkdtempSync(path.join(os.tmpdir(), "dest-tmpl-"));
  });

  afterEach(() => {
    fs.rmSync(srcDir, { recursive: true, force: true });
    fs.rmSync(destDir, { recursive: true, force: true });
  });

  it("copies files recursively", () => {
    fs.mkdirSync(path.join(srcDir, "sub"));
    fs.writeFileSync(path.join(srcDir, "file.txt"), "hello");
    fs.writeFileSync(path.join(srcDir, "sub", "nested.txt"), "world");

    copyTemplateFiles(srcDir, destDir, "myproject", "myproject");

    expect(fs.readFileSync(path.join(destDir, "file.txt"), "utf-8")).toBe(
      "hello",
    );
    expect(
      fs.readFileSync(path.join(destDir, "sub", "nested.txt"), "utf-8"),
    ).toBe("world");
  });

  it("substitutes placeholders in package.json files", () => {
    fs.writeFileSync(
      path.join(srcDir, "package.json"),
      JSON.stringify({ name: "{{projectName}}" }),
    );

    copyTemplateFiles(srcDir, destDir, "my-project", "my-project");

    const pkg = JSON.parse(
      fs.readFileSync(path.join(destDir, "package.json"), "utf-8"),
    );
    expect(pkg.name).toBe("my-project");
  });

  it("substitutes {{projectScope}} in nested package.json files", () => {
    fs.mkdirSync(path.join(srcDir, "agents", "test"), { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, "agents", "test", "package.json"),
      JSON.stringify({ name: "@{{projectScope}}/agent-test" }),
    );

    copyTemplateFiles(srcDir, destDir, "@acme/my-agent", "acme");

    const pkg = JSON.parse(
      fs.readFileSync(
        path.join(destDir, "agents", "test", "package.json"),
        "utf-8",
      ),
    );
    expect(pkg.name).toBe("@acme/agent-test");
  });

  it("does not substitute placeholders in non-package.json files", () => {
    fs.writeFileSync(
      path.join(srcDir, "README.md"),
      "Hello {{projectName}}",
    );

    copyTemplateFiles(srcDir, destDir, "my-project", "my-project");

    const content = fs.readFileSync(
      path.join(destDir, "README.md"),
      "utf-8",
    );
    expect(content).toBe("Hello {{projectName}}");
  });
});
