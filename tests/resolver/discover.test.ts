import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { discoverPackages } from "../../src/resolver/discover.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-discover-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writePackageJson(relPath: string, content: Record<string, unknown>): void {
  const dirPath = path.join(tmpDir, relPath);
  fs.mkdirSync(dirPath, { recursive: true });
  fs.writeFileSync(
    path.join(dirPath, "package.json"),
    JSON.stringify(content, null, 2),
  );
}

describe("discoverPackages", () => {
  describe("workspace directories", () => {
    it("discovers app packages in apps/ directory", () => {
      writePackageJson("apps/github", {
        name: "@clawforge/app-github",
        version: "1.2.0",
        forge: {
          type: "app",
          transport: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          tools: ["create_issue", "list_repos"],
          capabilities: ["tools"],
        },
      });

      const result = discoverPackages(tmpDir);
      expect(result.size).toBe(1);

      const pkg = result.get("@clawforge/app-github");
      expect(pkg).toBeDefined();
      expect(pkg?.name).toBe("@clawforge/app-github");
      expect(pkg?.version).toBe("1.2.0");
      expect(pkg?.forgeField.type).toBe("app");
    });

    it("discovers role packages in roles/ directory", () => {
      writePackageJson("roles/issue-manager", {
        name: "@clawforge/role-issue-manager",
        version: "2.0.0",
        forge: {
          type: "role",
          description: "Manages GitHub issues",
          permissions: {
            "@clawforge/app-github": {
              allow: ["create_issue"],
              deny: ["delete_repo"],
            },
          },
        },
      });

      const result = discoverPackages(tmpDir);
      expect(result.size).toBe(1);

      const pkg = result.get("@clawforge/role-issue-manager");
      expect(pkg).toBeDefined();
      expect(pkg?.forgeField.type).toBe("role");
    });

    it("discovers packages across all workspace directories", () => {
      writePackageJson("apps/github", {
        name: "@clawforge/app-github",
        version: "1.0.0",
        forge: { type: "app", transport: "stdio", command: "npx", args: [], tools: ["t"], capabilities: ["tools"] },
      });
      writePackageJson("skills/labeling", {
        name: "@clawforge/skill-labeling",
        version: "1.0.0",
        forge: { type: "skill", artifacts: ["./SKILL.md"], description: "Labeling" },
      });
      writePackageJson("tasks/triage", {
        name: "@clawforge/task-triage",
        version: "1.0.0",
        forge: { type: "task", taskType: "subagent" },
      });
      writePackageJson("roles/manager", {
        name: "@clawforge/role-manager",
        version: "1.0.0",
        forge: { type: "role", permissions: { "@clawforge/app-github": { allow: ["t"], deny: [] } } },
      });
      writePackageJson("agents/ops", {
        name: "@clawforge/agent-ops",
        version: "1.0.0",
        forge: { type: "agent", runtimes: ["claude-code"], roles: ["@clawforge/role-manager"] },
      });

      const result = discoverPackages(tmpDir);
      expect(result.size).toBe(5);
    });

    it("skips directories without package.json", () => {
      fs.mkdirSync(path.join(tmpDir, "apps/empty-dir"), { recursive: true });

      const result = discoverPackages(tmpDir);
      expect(result.size).toBe(0);
    });

    it("skips packages without forge field", () => {
      writePackageJson("apps/plain-npm", {
        name: "plain-npm-package",
        version: "1.0.0",
      });

      const result = discoverPackages(tmpDir);
      expect(result.size).toBe(0);
    });

    it("skips packages with invalid forge field", () => {
      writePackageJson("apps/bad-schema", {
        name: "bad-schema",
        version: "1.0.0",
        forge: { type: "app" }, // missing required fields
      });

      const result = discoverPackages(tmpDir);
      expect(result.size).toBe(0);
    });

    it("handles missing workspace directories gracefully", () => {
      // No workspace dirs at all
      const result = discoverPackages(tmpDir);
      expect(result.size).toBe(0);
    });
  });

  describe("node_modules", () => {
    it("discovers packages in node_modules", () => {
      writePackageJson("node_modules/some-app", {
        name: "some-app",
        version: "1.0.0",
        forge: { type: "app", transport: "stdio", command: "npx", args: [], tools: ["t"], capabilities: ["tools"] },
      });

      const result = discoverPackages(tmpDir);
      expect(result.size).toBe(1);
      expect(result.has("some-app")).toBe(true);
    });

    it("discovers scoped packages in node_modules", () => {
      writePackageJson("node_modules/@clawforge/app-github", {
        name: "@clawforge/app-github",
        version: "1.2.0",
        forge: {
          type: "app",
          transport: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          tools: ["create_issue"],
          capabilities: ["tools"],
        },
      });

      const result = discoverPackages(tmpDir);
      expect(result.size).toBe(1);
      expect(result.has("@clawforge/app-github")).toBe(true);
    });

    it("handles missing node_modules gracefully", () => {
      const result = discoverPackages(tmpDir);
      expect(result.size).toBe(0);
    });

    it("skips node_modules packages without forge field", () => {
      writePackageJson("node_modules/express", {
        name: "express",
        version: "4.18.0",
      });

      const result = discoverPackages(tmpDir);
      expect(result.size).toBe(0);
    });
  });

  describe("node_modules workspace dir scanning", () => {
    it("discovers sub-components inside a scoped node_modules package with workspace dirs", () => {
      // Simulate @clawforge/forge-core containing apps/, tasks/, skills/
      writePackageJson("node_modules/@clawforge/forge-core", {
        name: "@clawforge/forge-core",
        version: "0.1.0",
        // No forge field on the library itself
      });
      writePackageJson("node_modules/@clawforge/forge-core/apps/filesystem", {
        name: "@clawforge/app-filesystem",
        version: "0.1.0",
        forge: { type: "app", transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem"], tools: ["read_file"], capabilities: ["tools"] },
      });
      writePackageJson("node_modules/@clawforge/forge-core/tasks/take-notes", {
        name: "@clawforge/task-take-notes",
        version: "0.1.0",
        forge: { type: "task", taskType: "subagent" },
      });
      writePackageJson("node_modules/@clawforge/forge-core/skills/markdown-conventions", {
        name: "@clawforge/skill-markdown-conventions",
        version: "0.1.0",
        forge: { type: "skill", artifacts: ["./SKILL.md"], description: "Markdown writing conventions" },
      });

      const result = discoverPackages(tmpDir);
      expect(result.has("@clawforge/app-filesystem")).toBe(true);
      expect(result.has("@clawforge/task-take-notes")).toBe(true);
      expect(result.has("@clawforge/skill-markdown-conventions")).toBe(true);
      expect(result.get("@clawforge/app-filesystem")?.packagePath).toBe(
        path.join(tmpDir, "node_modules/@clawforge/forge-core/apps/filesystem"),
      );
    });

    it("discovers sub-components inside an unscoped node_modules package with workspace dirs", () => {
      writePackageJson("node_modules/forge-core/apps/tool", {
        name: "@org/app-tool",
        version: "1.0.0",
        forge: { type: "app", transport: "stdio", command: "node", args: ["server.js"], tools: ["run"], capabilities: ["tools"] },
      });

      const result = discoverPackages(tmpDir);
      expect(result.has("@org/app-tool")).toBe(true);
    });

    it("workspace-local packages take precedence over node_modules sub-components", () => {
      // Local workspace version
      writePackageJson("apps/filesystem", {
        name: "@clawforge/app-filesystem",
        version: "2.0.0",
        forge: { type: "app", transport: "stdio", command: "npx", args: [], tools: ["read_file"], capabilities: ["tools"] },
      });
      // Same package inside node_modules forge-core
      writePackageJson("node_modules/@clawforge/forge-core/apps/filesystem", {
        name: "@clawforge/app-filesystem",
        version: "1.0.0",
        forge: { type: "app", transport: "stdio", command: "npx", args: [], tools: ["read_file"], capabilities: ["tools"] },
      });

      const result = discoverPackages(tmpDir);
      const pkg = result.get("@clawforge/app-filesystem");
      expect(pkg).toBeDefined();
      expect(pkg?.version).toBe("2.0.0"); // Local version wins
      expect(pkg?.packagePath).toBe(path.join(tmpDir, "apps/filesystem"));
    });

    it("node_modules packages without workspace dirs are unaffected", () => {
      writePackageJson("node_modules/some-app", {
        name: "some-app",
        version: "1.0.0",
        forge: { type: "app", transport: "stdio", command: "npx", args: [], tools: ["t"], capabilities: ["tools"] },
      });

      const result = discoverPackages(tmpDir);
      expect(result.size).toBe(1);
      expect(result.has("some-app")).toBe(true);
    });

    it("registers both a package with a direct forge field and its workspace dir sub-components", () => {
      writePackageJson("node_modules/@org/lib", {
        name: "@org/lib",
        version: "1.0.0",
        forge: { type: "skill", artifacts: ["./LIB.md"], description: "Library skill" },
      });
      writePackageJson("node_modules/@org/lib/apps/tool", {
        name: "@org/app-tool",
        version: "1.0.0",
        forge: { type: "app", transport: "stdio", command: "node", args: ["server.js"], tools: ["run"], capabilities: ["tools"] },
      });

      const result = discoverPackages(tmpDir);
      expect(result.has("@org/lib")).toBe(true);
      expect(result.has("@org/app-tool")).toBe(true);
      expect(result.size).toBe(2);
    });

    it("skips sub-directories without valid forge packages inside workspace dirs", () => {
      // forge-core with an apps/ dir, but the sub-package has no forge field
      writePackageJson("node_modules/@clawforge/forge-core/apps/plain", {
        name: "plain-package",
        version: "1.0.0",
        // No forge field
      });

      const result = discoverPackages(tmpDir);
      expect(result.size).toBe(0);
    });
  });

  describe("precedence", () => {
    it("workspace packages take precedence over node_modules", () => {
      writePackageJson("apps/github", {
        name: "@clawforge/app-github",
        version: "2.0.0",
        forge: { type: "app", transport: "stdio", command: "npx", args: [], tools: ["t"], capabilities: ["tools"] },
      });
      writePackageJson("node_modules/@clawforge/app-github", {
        name: "@clawforge/app-github",
        version: "1.0.0",
        forge: { type: "app", transport: "stdio", command: "npx", args: [], tools: ["t"], capabilities: ["tools"] },
      });

      const result = discoverPackages(tmpDir);
      expect(result.size).toBe(1);
      const pkg = result.get("@clawforge/app-github");
      expect(pkg?.version).toBe("2.0.0");
    });
  });

  describe("DiscoveredPackage structure", () => {
    it("includes all required fields", () => {
      writePackageJson("apps/github", {
        name: "@clawforge/app-github",
        version: "1.2.0",
        forge: {
          type: "app",
          transport: "stdio",
          command: "npx",
          args: ["-y", "server"],
          tools: ["create_issue"],
          capabilities: ["tools"],
          env: { GITHUB_TOKEN: "${GITHUB_TOKEN}" },
        },
      });

      const result = discoverPackages(tmpDir);
      const pkg = result.get("@clawforge/app-github");
      expect(pkg).toBeDefined();
      expect(pkg?.name).toBe("@clawforge/app-github");
      expect(pkg?.version).toBe("1.2.0");
      expect(pkg?.packagePath).toBe(path.join(tmpDir, "apps/github"));
      expect(pkg?.forgeField.type).toBe("app");
    });

    it("defaults version to 0.0.0 when missing", () => {
      writePackageJson("apps/github", {
        name: "@clawforge/app-github",
        forge: { type: "app", transport: "stdio", command: "npx", args: [], tools: ["t"], capabilities: ["tools"] },
      });

      const result = discoverPackages(tmpDir);
      const pkg = result.get("@clawforge/app-github");
      expect(pkg).toBeDefined();
      expect(pkg?.version).toBe("0.0.0");
    });
  });
});
