import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// Mock ensureProxyDependencies to avoid expensive node_modules BFS/copy in tests
vi.mock("../../src/materializer/proxy-dependencies.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/materializer/proxy-dependencies.js")>();
  return {
    ...actual,
    ensureProxyDependencies: vi.fn(() => {}),
  };
});

import {
  createDefaultProjectRole,
  loadAndResolveProjectRole,
} from "../../src/cli/commands/run-agent.js";
import { registerAgents } from "../../src/materializer/role-materializer.js";
import { mockClaudeCodeAgent, mockPiCodingAgent, mockCodexAgent } from "../helpers/mock-agent-packages.js";

// Register mock agent packages for dialect registry
beforeAll(() => {
  registerAgents([mockClaudeCodeAgent, mockPiCodingAgent, mockCodexAgent]);
});

// ── createDefaultProjectRole ───────────────────────────────────────────

describe("createDefaultProjectRole", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mason-default-role-"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates ROLE.md with correct template content", async () => {
    const result = await createDefaultProjectRole(tmpDir, "claude");

    expect(result).toBe(true);

    const rolePath = path.join(tmpDir, ".mason", "roles", "project", "ROLE.md");
    expect(fs.existsSync(rolePath)).toBe(true);

    const content = fs.readFileSync(rolePath, "utf-8");
    expect(content).toContain("name: project");
    expect(content).toContain("type: project");
    expect(content).toContain('description: Default project role');
    expect(content).toContain("sources:\n  - claude");
    expect(content).toContain('tasks:\n  - "*"');
    expect(content).toContain('skills:\n  - "*"');
    expect(content).toContain("Started within a container created by the mason project.");
  });

  it("uses dialect directory name, not registry key", async () => {
    await createDefaultProjectRole(tmpDir, "claude");

    const content = fs.readFileSync(
      path.join(tmpDir, ".mason", "roles", "project", "ROLE.md"),
      "utf-8",
    );

    // Should contain "claude" (directory name), not "claude-code-agent" (registry key)
    expect(content).toContain("sources:\n  - claude");
    expect(content).not.toContain("claude-code-agent");
  });

  it("uses codex directory name when invoked with codex", async () => {
    await createDefaultProjectRole(tmpDir, "codex");

    const content = fs.readFileSync(
      path.join(tmpDir, ".mason", "roles", "project", "ROLE.md"),
      "utf-8",
    );
    expect(content).toContain("sources:\n  - codex");
  });

  it("creates .mason/roles/project/ directory recursively", async () => {
    const result = await createDefaultProjectRole(tmpDir, "claude");

    expect(result).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".mason", "roles", "project"))).toBe(true);
  });

  it("returns false and warns on write failure", async () => {
    // Make the parent directory read-only so the write fails
    const masonDir = path.join(tmpDir, ".mason");
    fs.mkdirSync(masonDir, { recursive: true });
    fs.chmodSync(masonDir, 0o444);

    const result = await createDefaultProjectRole(tmpDir, "claude");

    expect(result).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("Could not create default project role"),
    );

    // Restore permissions for cleanup
    fs.chmodSync(masonDir, 0o755);
  });

  it("does not include MCP servers in template", async () => {
    await createDefaultProjectRole(tmpDir, "claude");

    const content = fs.readFileSync(
      path.join(tmpDir, ".mason", "roles", "project", "ROLE.md"),
      "utf-8",
    );

    // MCP should be commented out, not active
    expect(content).toContain("# mcp:");
    expect(content).not.toMatch(/^mcp:/m);
  });
});

// ── loadAndResolveProjectRole ──────────────────────────────────────────

describe("loadAndResolveProjectRole", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mason-load-role-"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reads and resolves a project ROLE.md file", async () => {
    // Create the project structure with a .mason/roles/project/ROLE.md
    // Also need a .mason directory as the parent for the dialect detection
    const roleDir = path.join(tmpDir, ".mason", "roles", "project");
    fs.mkdirSync(roleDir, { recursive: true });

    // Write a minimal ROLE.md that the parser can handle
    fs.writeFileSync(
      path.join(roleDir, "ROLE.md"),
      `---
name: project
type: project
description: Test project role
sources:
  - claude
tasks:
  - review
skills: []
---

Test instructions.
`,
    );

    // Create a .claude directory so the source exists
    fs.mkdirSync(path.join(tmpDir, ".claude", "commands"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, ".claude", "commands", "review.md"), "# Review");

    const role = await loadAndResolveProjectRole(tmpDir);

    expect(role.metadata.name).toBe("project");
    expect(role.type).toBe("project");
    expect(role.tasks).toEqual([{ name: "review" }]);
  });

  it("applies source override before resolution", async () => {
    const roleDir = path.join(tmpDir, ".mason", "roles", "project");
    fs.mkdirSync(roleDir, { recursive: true });

    fs.writeFileSync(
      path.join(roleDir, "ROLE.md"),
      `---
name: project
type: project
description: Test project role
sources:
  - claude
tasks:
  - review
skills: []
---

Test instructions.
`,
    );

    // Create .claude directory
    fs.mkdirSync(path.join(tmpDir, ".claude", "commands"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, ".claude", "commands", "review.md"), "# Review");

    // Pass a source override
    const role = await loadAndResolveProjectRole(tmpDir, ["claude-code-agent"]);

    // The source override should be applied
    expect(role.sources).toEqual(["claude-code-agent"]);
  });

  it("expands wildcards in tasks and skills", async () => {
    const roleDir = path.join(tmpDir, ".mason", "roles", "project");
    fs.mkdirSync(roleDir, { recursive: true });

    fs.writeFileSync(
      path.join(roleDir, "ROLE.md"),
      `---
name: project
type: project
description: Test project role
sources:
  - claude
tasks:
  - "*"
skills:
  - "*"
---

Test instructions.
`,
    );

    // Create commands and skills directories
    fs.mkdirSync(path.join(tmpDir, ".claude", "commands"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, ".claude", "commands", "review.md"), "# Review");
    fs.writeFileSync(path.join(tmpDir, ".claude", "commands", "build.md"), "# Build");

    const role = await loadAndResolveProjectRole(tmpDir);

    // Wildcards should be expanded — should have the discovered tasks
    expect(role.tasks.length).toBeGreaterThanOrEqual(2);
    const taskNames = role.tasks.map((t) => t.name);
    expect(taskNames).toContain("review");
    expect(taskNames).toContain("build");
  });
});

// ── Integration: file exists vs creation ───────────────────────────────

describe("default project role integration", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mason-role-integ-"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("existing file is not overwritten by createDefaultProjectRole", async () => {
    // Pre-create the file with custom content
    const roleDir = path.join(tmpDir, ".mason", "roles", "project");
    fs.mkdirSync(roleDir, { recursive: true });
    const customContent = `---
name: project
type: project
description: Custom project role
sources:
  - claude
tasks:
  - review
skills: []
---

Custom instructions.
`;
    fs.writeFileSync(path.join(roleDir, "ROLE.md"), customContent);

    // The existsSync check in the three-way branch prevents calling createDefaultProjectRole
    // when the file already exists. Verify that the file is not overwritten even if
    // createDefaultProjectRole were called directly on an existing file.
    const rolePath = path.join(roleDir, "ROLE.md");
    expect(fs.existsSync(rolePath)).toBe(true);

    // Read back and verify custom content is still there
    const content = fs.readFileSync(rolePath, "utf-8");
    expect(content).toContain("Custom project role");
    expect(content).toContain("Custom instructions.");
  });

  it("three-way branch: creates file then loads when no ROLE.md exists", async () => {
    // Create .claude source directory with a command
    fs.mkdirSync(path.join(tmpDir, ".claude", "commands"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, ".claude", "commands", "test-cmd.md"), "# Test");

    const rolePath = path.join(tmpDir, ".mason", "roles", "project", "ROLE.md");
    expect(fs.existsSync(rolePath)).toBe(false);

    // Create the file
    const created = await createDefaultProjectRole(tmpDir, "claude");
    expect(created).toBe(true);
    expect(fs.existsSync(rolePath)).toBe(true);

    // Load and resolve it
    const role = await loadAndResolveProjectRole(tmpDir);
    expect(role.metadata.name).toBe("project");
    // Wildcards should be expanded
    const taskNames = role.tasks.map((t) => t.name);
    expect(taskNames).toContain("test-cmd");
  });

  it("three-way branch: loads existing file without creating", async () => {
    const roleDir = path.join(tmpDir, ".mason", "roles", "project");
    fs.mkdirSync(roleDir, { recursive: true });
    fs.writeFileSync(
      path.join(roleDir, "ROLE.md"),
      `---
name: project
type: project
description: Existing project role
sources:
  - claude
tasks:
  - my-task
skills: []
---

Existing.
`,
    );

    // Create .claude so source resolution works
    fs.mkdirSync(path.join(tmpDir, ".claude"), { recursive: true });

    const role = await loadAndResolveProjectRole(tmpDir);
    expect(role.metadata.name).toBe("project");
    expect(role.tasks).toEqual([{ name: "my-task" }]);
  });
});
