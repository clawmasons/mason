import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { discoverPackages } from "../../src/resolver/discover.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mason-discover-"));
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
        name: "@clawmasons/app-github",
        version: "1.2.0",
        mason: {
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

      const pkg = result.get("@clawmasons/app-github");
      expect(pkg).toBeDefined();
      expect(pkg?.name).toBe("@clawmasons/app-github");
      expect(pkg?.version).toBe("1.2.0");
      expect(pkg?.field.type).toBe("app");
    });

    it("discovers role packages in roles/ directory", () => {
      writePackageJson("roles/issue-manager", {
        name: "@clawmasons/role-issue-manager",
        version: "2.0.0",
        mason: {
          type: "role",
          description: "Manages GitHub issues",
          permissions: {
            "@clawmasons/app-github": {
              allow: ["create_issue"],
              deny: ["delete_repo"],
            },
          },
        },
      });

      const result = discoverPackages(tmpDir);
      expect(result.size).toBe(1);

      const pkg = result.get("@clawmasons/role-issue-manager");
      expect(pkg).toBeDefined();
      expect(pkg?.field.type).toBe("role");
    });

    it("discovers packages across all workspace directories", () => {
      writePackageJson("apps/github", {
        name: "@clawmasons/app-github",
        version: "1.0.0",
        mason: { type: "app", transport: "stdio", command: "npx", args: [], tools: ["t"], capabilities: ["tools"] },
      });
      writePackageJson("skills/labeling", {
        name: "@clawmasons/skill-labeling",
        version: "1.0.0",
        mason: { type: "skill", artifacts: ["./SKILL.md"], description: "Labeling" },
      });
      writePackageJson("tasks/triage", {
        name: "@clawmasons/task-triage",
        version: "1.0.0",
        mason: { type: "task", taskType: "subagent" },
      });
      writePackageJson("roles/manager", {
        name: "@clawmasons/role-manager",
        version: "1.0.0",
        mason: { type: "role", permissions: { "@clawmasons/app-github": { allow: ["t"], deny: [] } } },
      });
      const result = discoverPackages(tmpDir);
      expect(result.size).toBe(4);
    });

    it("skips directories without package.json", () => {
      fs.mkdirSync(path.join(tmpDir, "apps/empty-dir"), { recursive: true });

      const result = discoverPackages(tmpDir);
      expect(result.size).toBe(0);
    });

    it("skips packages without mason field", () => {
      writePackageJson("apps/plain-npm", {
        name: "plain-npm-package",
        version: "1.0.0",
      });

      const result = discoverPackages(tmpDir);
      expect(result.size).toBe(0);
    });

    it("skips packages with invalid mason field", () => {
      writePackageJson("apps/bad-schema", {
        name: "bad-schema",
        version: "1.0.0",
        mason: { type: "app" }, // missing required fields
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
        mason: { type: "app", transport: "stdio", command: "npx", args: [], tools: ["t"], capabilities: ["tools"] },
      });

      const result = discoverPackages(tmpDir);
      expect(result.size).toBe(1);
      expect(result.has("some-app")).toBe(true);
    });

    it("discovers scoped packages in node_modules", () => {
      writePackageJson("node_modules/@clawmasons/app-github", {
        name: "@clawmasons/app-github",
        version: "1.2.0",
        mason: {
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
      expect(result.has("@clawmasons/app-github")).toBe(true);
    });

    it("handles missing node_modules gracefully", () => {
      const result = discoverPackages(tmpDir);
      expect(result.size).toBe(0);
    });

    it("skips node_modules packages without mason field", () => {
      writePackageJson("node_modules/express", {
        name: "express",
        version: "4.18.0",
      });

      const result = discoverPackages(tmpDir);
      expect(result.size).toBe(0);
    });
  });

  describe("precedence", () => {
    it("workspace packages take precedence over node_modules", () => {
      writePackageJson("apps/github", {
        name: "@clawmasons/app-github",
        version: "2.0.0",
        mason: { type: "app", transport: "stdio", command: "npx", args: [], tools: ["t"], capabilities: ["tools"] },
      });
      writePackageJson("node_modules/@clawmasons/app-github", {
        name: "@clawmasons/app-github",
        version: "1.0.0",
        mason: { type: "app", transport: "stdio", command: "npx", args: [], tools: ["t"], capabilities: ["tools"] },
      });

      const result = discoverPackages(tmpDir);
      expect(result.size).toBe(1);
      const pkg = result.get("@clawmasons/app-github");
      expect(pkg?.version).toBe("2.0.0");
    });
  });

  describe("DiscoveredPackage structure", () => {
    it("includes all required fields", () => {
      writePackageJson("apps/github", {
        name: "@clawmasons/app-github",
        version: "1.2.0",
        mason: {
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
      const pkg = result.get("@clawmasons/app-github");
      expect(pkg).toBeDefined();
      expect(pkg?.name).toBe("@clawmasons/app-github");
      expect(pkg?.version).toBe("1.2.0");
      expect(pkg?.packagePath).toBe(path.join(tmpDir, "apps/github"));
      expect(pkg?.field.type).toBe("app");
    });

    it("defaults version to 0.0.0 when missing", () => {
      writePackageJson("apps/github", {
        name: "@clawmasons/app-github",
        mason: { type: "app", transport: "stdio", command: "npx", args: [], tools: ["t"], capabilities: ["tools"] },
      });

      const result = discoverPackages(tmpDir);
      const pkg = result.get("@clawmasons/app-github");
      expect(pkg).toBeDefined();
      expect(pkg?.version).toBe("0.0.0");
    });
  });
});
