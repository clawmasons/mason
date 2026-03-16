import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  readMaterializedRole,
  parseFrontmatter,
  detectDialect,
  RoleParseError,
  scanBundledResources,
  getDialect,
  getDialectByDirectory,
  getAllDialects,
  getKnownDirectories,
  registerDialect,
} from "@clawmasons/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testDir: string;

async function createRoleFile(
  agentDir: string,
  roleName: string,
  content: string,
): Promise<string> {
  const roleDir = join(testDir, `.${agentDir}`, "roles", roleName);
  await mkdir(roleDir, { recursive: true });
  const rolePath = join(roleDir, "ROLE.md");
  await writeFile(rolePath, content);
  return rolePath;
}

const CLAUDE_ROLE_MD = `---
name: create-prd
description: Creates product requirements documents
version: 1.0.0
scope: acme.engineering
commands:
  - define-change
  - review-change
skills:
  - '@acme/skill-prd-writing'
mcp_servers:
  - name: github
    tools:
      allow:
        - create_issue
        - list_repos
      deny:
        - delete_repo
container:
  packages:
    apt:
      - jq
      - curl
    npm:
      - typescript
  ignore:
    paths:
      - '.mason/'
      - '.env'
risk: LOW
credentials:
  - GITHUB_TOKEN
constraints:
  maxConcurrentTasks: 3
  requireApprovalFor:
    - create_pr
---

You are a PRD author. Create clear, well-structured product requirements documents.

When defining requirements:
- Use concrete use cases with acceptance criteria
- Separate functional from non-functional requirements
`;

const CODEX_ROLE_MD = `---
name: code-review
description: Reviews code changes
instructions:
  - review-diff
  - suggest-fixes
mcp_servers:
  - name: github
    tools:
      allow:
        - get_pull_request
---

You review code changes for correctness and style.
`;

const AIDER_ROLE_MD = `---
name: refactor-helper
description: Helps with code refactoring
conventions:
  - rename-symbol
  - extract-function
skills:
  - '@acme/skill-refactoring'
---

You help developers refactor code safely.
`;

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  testDir = join(tmpdir(), `role-parser-test-${Date.now()}-${Math.random().toString(36).substring(7)}`);
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Dialect Registry
// ---------------------------------------------------------------------------

describe("dialectRegistry", () => {
  it("has three built-in dialects", () => {
    const all = getAllDialects();
    expect(all.length).toBeGreaterThanOrEqual(3);
    expect(all.map((d) => d.name)).toContain("claude-code");
    expect(all.map((d) => d.name)).toContain("codex");
    expect(all.map((d) => d.name)).toContain("aider");
  });

  it("looks up dialect by name", () => {
    const claude = getDialect("claude-code");
    expect(claude).toBeDefined();
    expect(claude!.directory).toBe("claude");
    expect(claude!.fieldMapping.tasks).toBe("commands");
    expect(claude!.fieldMapping.apps).toBe("mcp_servers");
    expect(claude!.fieldMapping.skills).toBe("skills");
  });

  it("looks up dialect by directory", () => {
    const codex = getDialectByDirectory("codex");
    expect(codex).toBeDefined();
    expect(codex!.name).toBe("codex");
    expect(codex!.fieldMapping.tasks).toBe("instructions");
  });

  it("returns undefined for unknown dialect", () => {
    expect(getDialect("unknown")).toBeUndefined();
    expect(getDialectByDirectory("unknown")).toBeUndefined();
  });

  it("lists known directories", () => {
    const dirs = getKnownDirectories();
    expect(dirs).toContain("claude");
    expect(dirs).toContain("codex");
    expect(dirs).toContain("aider");
  });

  it("allows registering a new dialect", () => {
    registerDialect({
      name: "test-dialect",
      directory: "testdir",
      fieldMapping: { tasks: "actions", apps: "servers", skills: "modules" },
    });
    const d = getDialect("test-dialect");
    expect(d).toBeDefined();
    expect(d!.fieldMapping.tasks).toBe("actions");
    // Clean up by re-registering doesn't cause issues
  });

  it("maps Aider fields correctly", () => {
    const aider = getDialect("aider");
    expect(aider).toBeDefined();
    expect(aider!.fieldMapping.tasks).toBe("conventions");
    expect(aider!.fieldMapping.apps).toBe("mcp_servers");
  });
});

// ---------------------------------------------------------------------------
// Frontmatter Parsing
// ---------------------------------------------------------------------------

describe("parseFrontmatter", () => {
  it("parses valid frontmatter and body", () => {
    const content = `---
name: test
description: A test
---

This is the body.`;
    const { frontmatter, body } = parseFrontmatter(content, "/test/ROLE.md");
    expect(frontmatter.name).toBe("test");
    expect(frontmatter.description).toBe("A test");
    expect(body).toBe("This is the body.");
  });

  it("handles empty body", () => {
    const content = `---
name: test
description: A test
---
`;
    const { frontmatter, body } = parseFrontmatter(content, "/test/ROLE.md");
    expect(frontmatter.name).toBe("test");
    expect(body).toBe("");
  });

  it("handles complex YAML frontmatter", () => {
    const content = `---
name: test
description: A test
commands:
  - cmd1
  - cmd2
mcp_servers:
  - name: github
    tools:
      allow:
        - create_issue
---

Body text.`;
    const { frontmatter } = parseFrontmatter(content, "/test/ROLE.md");
    expect(frontmatter.commands).toEqual(["cmd1", "cmd2"]);
    expect(frontmatter.mcp_servers).toHaveLength(1);
  });

  it("rejects content without frontmatter", () => {
    expect(() => parseFrontmatter("No frontmatter here", "/test/ROLE.md")).toThrow(
      RoleParseError,
    );
  });

  it("rejects unclosed frontmatter", () => {
    expect(() =>
      parseFrontmatter("---\nname: test\n", "/test/ROLE.md"),
    ).toThrow(RoleParseError);
  });

  it("rejects invalid YAML", () => {
    const content = `---
name: test
  bad indent: [
---

Body.`;
    expect(() => parseFrontmatter(content, "/test/ROLE.md")).toThrow(
      RoleParseError,
    );
  });

  it("rejects non-mapping frontmatter (array)", () => {
    const content = `---
- item1
- item2
---

Body.`;
    expect(() => parseFrontmatter(content, "/test/ROLE.md")).toThrow(
      RoleParseError,
    );
  });

  it("includes file path in error messages", () => {
    try {
      parseFrontmatter("No frontmatter", "/my/path/ROLE.md");
    } catch (err) {
      expect(err).toBeInstanceOf(RoleParseError);
      expect((err as RoleParseError).message).toContain("/my/path/ROLE.md");
      expect((err as RoleParseError).rolePath).toBe("/my/path/ROLE.md");
    }
  });
});

// ---------------------------------------------------------------------------
// Dialect Detection
// ---------------------------------------------------------------------------

describe("detectDialect", () => {
  it("detects Claude Code dialect", async () => {
    const roleDir = join(testDir, ".claude", "roles", "my-role");
    await mkdir(roleDir, { recursive: true });
    const dialect = detectDialect(roleDir, join(roleDir, "ROLE.md"));
    expect(dialect.name).toBe("claude-code");
  });

  it("detects Codex dialect", async () => {
    const roleDir = join(testDir, ".codex", "roles", "my-role");
    await mkdir(roleDir, { recursive: true });
    const dialect = detectDialect(roleDir, join(roleDir, "ROLE.md"));
    expect(dialect.name).toBe("codex");
  });

  it("detects Aider dialect", async () => {
    const roleDir = join(testDir, ".aider", "roles", "my-role");
    await mkdir(roleDir, { recursive: true });
    const dialect = detectDialect(roleDir, join(roleDir, "ROLE.md"));
    expect(dialect.name).toBe("aider");
  });

  it("rejects path not inside roles/ directory", async () => {
    const roleDir = join(testDir, ".claude", "other", "my-role");
    await mkdir(roleDir, { recursive: true });
    expect(() => detectDialect(roleDir, join(roleDir, "ROLE.md"))).toThrow(
      RoleParseError,
    );
  });

  it("rejects path with non-dot agent directory", async () => {
    const roleDir = join(testDir, "claude", "roles", "my-role");
    await mkdir(roleDir, { recursive: true });
    expect(() => detectDialect(roleDir, join(roleDir, "ROLE.md"))).toThrow(
      RoleParseError,
    );
  });

  it("rejects unknown agent directory", async () => {
    const roleDir = join(testDir, ".unknown-agent", "roles", "my-role");
    await mkdir(roleDir, { recursive: true });
    expect(() => detectDialect(roleDir, join(roleDir, "ROLE.md"))).toThrow(
      RoleParseError,
    );
  });
});

// ---------------------------------------------------------------------------
// Resource Scanner
// ---------------------------------------------------------------------------

describe("scanBundledResources", () => {
  it("discovers sibling files and directories", async () => {
    const roleDir = join(testDir, "role-with-resources");
    await mkdir(join(roleDir, "templates"), { recursive: true });
    await mkdir(join(roleDir, "scripts"), { recursive: true });
    await writeFile(join(roleDir, "ROLE.md"), "---\nname: test\n---\nBody");
    await writeFile(join(roleDir, "templates", "prd.md"), "# Template");
    await writeFile(join(roleDir, "scripts", "gen.py"), "print('hello')");

    const resources = await scanBundledResources(roleDir);
    expect(resources).toHaveLength(2);

    const paths = resources.map((r) => r.relativePath).sort();
    expect(paths).toEqual(["scripts/gen.py", "templates/prd.md"]);

    // Verify absolute paths
    for (const r of resources) {
      expect(r.absolutePath).toContain(roleDir);
      expect(r.permissions).toBeTypeOf("number");
    }
  });

  it("excludes ROLE.md from resources", async () => {
    const roleDir = join(testDir, "role-simple");
    await mkdir(roleDir, { recursive: true });
    await writeFile(join(roleDir, "ROLE.md"), "---\nname: test\n---\nBody");
    await writeFile(join(roleDir, "helper.sh"), "#!/bin/bash");

    const resources = await scanBundledResources(roleDir);
    expect(resources).toHaveLength(1);
    expect(resources[0].relativePath).toBe("helper.sh");
  });

  it("returns empty array for directory with only ROLE.md", async () => {
    const roleDir = join(testDir, "role-empty");
    await mkdir(roleDir, { recursive: true });
    await writeFile(join(roleDir, "ROLE.md"), "---\nname: test\n---\nBody");

    const resources = await scanBundledResources(roleDir);
    expect(resources).toHaveLength(0);
  });

  it("handles nested directories", async () => {
    const roleDir = join(testDir, "role-nested");
    await mkdir(join(roleDir, "a", "b", "c"), { recursive: true });
    await writeFile(join(roleDir, "ROLE.md"), "---\nname: test\n---\nBody");
    await writeFile(join(roleDir, "a", "file1.txt"), "1");
    await writeFile(join(roleDir, "a", "b", "file2.txt"), "2");
    await writeFile(join(roleDir, "a", "b", "c", "file3.txt"), "3");

    const resources = await scanBundledResources(roleDir);
    expect(resources).toHaveLength(3);
    const paths = resources.map((r) => r.relativePath).sort();
    expect(paths).toEqual(["a/b/c/file3.txt", "a/b/file2.txt", "a/file1.txt"]);
  });
});

// ---------------------------------------------------------------------------
// readMaterializedRole — Claude Code Dialect
// ---------------------------------------------------------------------------

describe("readMaterializedRole — Claude Code", () => {
  it("parses a full Claude Code ROLE.md", async () => {
    const rolePath = await createRoleFile("claude", "create-prd", CLAUDE_ROLE_MD);
    const role = await readMaterializedRole(rolePath);

    // Metadata
    expect(role.metadata.name).toBe("create-prd");
    expect(role.metadata.description).toBe("Creates product requirements documents");
    expect(role.metadata.version).toBe("1.0.0");
    expect(role.metadata.scope).toBe("acme.engineering");

    // Instructions (markdown body)
    expect(role.instructions).toContain("You are a PRD author");
    expect(role.instructions).toContain("acceptance criteria");

    // Tasks (normalized from "commands")
    expect(role.tasks).toHaveLength(2);
    expect(role.tasks[0].name).toBe("define-change");
    expect(role.tasks[1].name).toBe("review-change");

    // Apps (normalized from "mcp_servers")
    expect(role.apps).toHaveLength(1);
    expect(role.apps[0].name).toBe("github");
    expect(role.apps[0].tools.allow).toContain("create_issue");
    expect(role.apps[0].tools.deny).toContain("delete_repo");

    // Skills
    expect(role.skills).toHaveLength(1);
    expect(role.skills[0].ref).toBe("@acme/skill-prd-writing");

    // Container
    expect(role.container.packages.apt).toContain("jq");
    expect(role.container.packages.npm).toContain("typescript");
    expect(role.container.ignore.paths).toContain(".env");

    // Governance
    expect(role.governance.risk).toBe("LOW");
    expect(role.governance.credentials).toContain("GITHUB_TOKEN");
    expect(role.governance.constraints?.maxConcurrentTasks).toBe(3);
    expect(role.governance.constraints?.requireApprovalFor).toContain("create_pr");

    // Source
    expect(role.source.type).toBe("local");
    expect(role.source.agentDialect).toBe("claude-code");
  });

  it("discovers bundled resources", async () => {
    const roleDir = join(testDir, ".claude", "roles", "with-resources");
    await mkdir(join(roleDir, "templates"), { recursive: true });
    await writeFile(
      join(roleDir, "ROLE.md"),
      `---
name: with-resources
description: Role with bundled resources
---

Instructions here.`,
    );
    await writeFile(join(roleDir, "templates", "prd.md"), "# Template");

    const role = await readMaterializedRole(join(roleDir, "ROLE.md"));
    expect(role.resources).toHaveLength(1);
    expect(role.resources[0].relativePath).toBe("templates/prd.md");
    expect(role.resources[0].absolutePath).toContain("templates/prd.md");
  });

  it("defaults type to project when omitted", async () => {
    const rolePath = await createRoleFile("claude", "no-type", `---
name: no-type
description: Role without explicit type
---

Instructions.`);
    const role = await readMaterializedRole(rolePath);
    expect(role.type).toBe("project");
  });

  it("parses type: supervisor from frontmatter", async () => {
    const rolePath = await createRoleFile("claude", "supervisor-role", `---
name: supervisor-role
description: A supervisor role
type: supervisor
---

Instructions.`);
    const role = await readMaterializedRole(rolePath);
    expect(role.type).toBe("supervisor");
  });
});

// ---------------------------------------------------------------------------
// readMaterializedRole — Codex Dialect
// ---------------------------------------------------------------------------

describe("readMaterializedRole — Codex", () => {
  it("parses a Codex ROLE.md with instructions→tasks normalization", async () => {
    const rolePath = await createRoleFile("codex", "code-review", CODEX_ROLE_MD);
    const role = await readMaterializedRole(rolePath);

    expect(role.metadata.name).toBe("code-review");
    expect(role.metadata.description).toBe("Reviews code changes");

    // "instructions" field normalized to "tasks"
    expect(role.tasks).toHaveLength(2);
    expect(role.tasks[0].name).toBe("review-diff");
    expect(role.tasks[1].name).toBe("suggest-fixes");

    // Apps from mcp_servers
    expect(role.apps).toHaveLength(1);
    expect(role.apps[0].name).toBe("github");

    // Source
    expect(role.source.agentDialect).toBe("codex");
  });
});

// ---------------------------------------------------------------------------
// readMaterializedRole — Aider Dialect
// ---------------------------------------------------------------------------

describe("readMaterializedRole — Aider", () => {
  it("parses an Aider ROLE.md with conventions→tasks normalization", async () => {
    const rolePath = await createRoleFile("aider", "refactor-helper", AIDER_ROLE_MD);
    const role = await readMaterializedRole(rolePath);

    expect(role.metadata.name).toBe("refactor-helper");
    expect(role.metadata.description).toBe("Helps with code refactoring");

    // "conventions" field normalized to "tasks"
    expect(role.tasks).toHaveLength(2);
    expect(role.tasks[0].name).toBe("rename-symbol");
    expect(role.tasks[1].name).toBe("extract-function");

    // Skills
    expect(role.skills).toHaveLength(1);
    expect(role.skills[0].ref).toBe("@acme/skill-refactoring");

    // Source
    expect(role.source.agentDialect).toBe("aider");
  });
});

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

describe("readMaterializedRole — error handling", () => {
  it("rejects ROLE.md without frontmatter", async () => {
    const rolePath = await createRoleFile(
      "claude",
      "bad-no-frontmatter",
      "Just plain text, no frontmatter.",
    );
    await expect(readMaterializedRole(rolePath)).rejects.toThrow(RoleParseError);
  });

  it("rejects ROLE.md with malformed YAML", async () => {
    const rolePath = await createRoleFile(
      "claude",
      "bad-yaml",
      `---
name: test
  bad: [indent
---

Body.`,
    );
    await expect(readMaterializedRole(rolePath)).rejects.toThrow(RoleParseError);
  });

  it("rejects ROLE.md without description", async () => {
    const rolePath = await createRoleFile(
      "claude",
      "no-desc",
      `---
name: test-no-desc
---

Body.`,
    );
    await expect(readMaterializedRole(rolePath)).rejects.toThrow(RoleParseError);
  });

  it("rejects ROLE.md in unknown agent directory", async () => {
    const rolePath = await createRoleFile(
      "unknown-agent",
      "some-role",
      `---
name: some-role
description: Some role
---

Body.`,
    );
    await expect(readMaterializedRole(rolePath)).rejects.toThrow(RoleParseError);
  });

  it("rejects non-existent file", async () => {
    await expect(
      readMaterializedRole(join(testDir, "nonexistent", "ROLE.md")),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Skill reference resolution
// ---------------------------------------------------------------------------

describe("readMaterializedRole — skill references", () => {
  it("resolves package skill references", async () => {
    const rolePath = await createRoleFile(
      "claude",
      "skill-refs",
      `---
name: skill-refs
description: Tests skill reference handling
skills:
  - '@acme/skill-prd-writing'
  - simple-skill
---

Instructions.`,
    );
    const role = await readMaterializedRole(rolePath);

    expect(role.skills).toHaveLength(2);
    // Scoped package — name extracted from package
    expect(role.skills[0].name).toBe("skill-prd-writing");
    expect(role.skills[0].ref).toBe("@acme/skill-prd-writing");
    // Simple name — used as-is
    expect(role.skills[1].name).toBe("simple-skill");
    expect(role.skills[1].ref).toBe("simple-skill");
  });

  it("resolves local path skill references relative to project root", async () => {
    const rolePath = await createRoleFile(
      "claude",
      "local-skills",
      `---
name: local-skills
description: Tests local skill paths
skills:
  - ./skills/my-skill
---

Instructions.`,
    );
    const role = await readMaterializedRole(rolePath);

    expect(role.skills).toHaveLength(1);
    expect(role.skills[0].name).toBe("my-skill");
    // ref should be an absolute path resolved from project root
    expect(role.skills[0].ref).toContain("skills/my-skill");
  });
});

// ---------------------------------------------------------------------------
// Minimal valid ROLE.md
// ---------------------------------------------------------------------------

describe("readMaterializedRole — minimal", () => {
  it("accepts a minimal ROLE.md with only required fields", async () => {
    const rolePath = await createRoleFile(
      "claude",
      "minimal-role",
      `---
name: minimal
description: A minimal role
---

Do minimal things.`,
    );
    const role = await readMaterializedRole(rolePath);

    expect(role.metadata.name).toBe("minimal");
    expect(role.metadata.description).toBe("A minimal role");
    expect(role.instructions).toBe("Do minimal things.");
    expect(role.tasks).toEqual([]);
    expect(role.apps).toEqual([]);
    expect(role.skills).toEqual([]);
    expect(role.resources).toEqual([]);
    expect(role.governance.risk).toBe("LOW");
    expect(role.source.type).toBe("local");
  });

  it("derives role name from directory when name field is absent", async () => {
    const rolePath = await createRoleFile(
      "claude",
      "dir-name-role",
      `---
description: Role without explicit name
---

Instructions.`,
    );
    const role = await readMaterializedRole(rolePath);
    expect(role.metadata.name).toBe("dir-name-role");
  });
});
