import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@clawmasons/shared";

// Mock scanProject before importing the module under test
vi.mock("../../src/mason/scanner.js", () => ({
  scanProject: vi.fn(),
}));

import { resolveRoleFields } from "../../src/role/resolve-role-fields.js";
import { scanProject } from "../../src/mason/scanner.js";

const mockedScanProject = vi.mocked(scanProject);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRole(overrides: Partial<Role> = {}): Role {
  return {
    metadata: { name: "test", description: "Test role" },
    instructions: "Test instructions",
    type: "project",
    tasks: [],
    mcp: [],
    skills: [],
    sources: ["mason"],
    container: {
      packages: { apt: [], npm: [], pip: [] },
      ignore: { paths: [] },
      mounts: [],
    },
    governance: { risk: "LOW", credentials: [] },
    resources: [],
    role: { includes: [] },
    source: { type: "local", agentDialect: "mason", path: "/fake" },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("resolveRoleFields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns role unchanged when no wildcards present", async () => {
    const role = makeRole({
      tasks: [{ name: "review" }],
      skills: [{ name: "testing" }],
    });

    const result = await resolveRoleFields(role, "/fake/project");

    // scanProject should NOT be called — no wildcards
    expect(mockedScanProject).not.toHaveBeenCalled();
    expect(result).toEqual(role);
  });

  it("warns and returns unchanged when sources are empty", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const role = makeRole({
      tasks: [{ name: "*" }],
      sources: [],
    });

    const result = await resolveRoleFields(role, "/fake/project");

    expect(mockedScanProject).not.toHaveBeenCalled();
    expect(result).toEqual(role);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("no sources defined"),
    );

    warnSpy.mockRestore();
  });

  it("expands task and skill wildcards via scanProject", async () => {
    mockedScanProject.mockResolvedValue({
      projectDir: "/fake/project",
      commands: [
        { name: "review", path: "/fake/review.md", dialect: "mason" },
        { name: "deploy/staging", path: "/fake/deploy/staging.md", dialect: "mason" },
        { name: "build", path: "/fake/build.md", dialect: "mason" },
      ],
      skills: [
        { name: "testing", path: "/fake/skills/testing", dialect: "mason" },
        { name: "linting", path: "/fake/skills/linting", dialect: "mason" },
      ],
      mcpServers: [],
      systemPrompt: undefined,
    });

    const role = makeRole({
      tasks: [{ name: "*" }],
      skills: [{ name: "*" }],
    });

    const result = await resolveRoleFields(role, "/fake/project");

    expect(mockedScanProject).toHaveBeenCalledOnce();
    expect(result.tasks.map((t) => t.name)).toEqual([
      "review",
      "deploy/staging",
      "build",
    ]);
    expect(result.skills.map((s) => s.name)).toEqual(["testing", "linting"]);
  });

  it("expands only tasks when only tasks have wildcards", async () => {
    mockedScanProject.mockResolvedValue({
      projectDir: "/fake/project",
      commands: [
        { name: "review", path: "/fake/review.md", dialect: "mason" },
      ],
      skills: [],
      mcpServers: [],
      systemPrompt: undefined,
    });

    const role = makeRole({
      tasks: [{ name: "*" }],
      skills: [{ name: "testing" }],
    });

    const result = await resolveRoleFields(role, "/fake/project");

    expect(result.tasks.map((t) => t.name)).toEqual(["review"]);
    // Skills unchanged — no wildcard
    expect(result.skills).toEqual([{ name: "testing" }]);
  });

  it("emits warnings for zero-match patterns", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    mockedScanProject.mockResolvedValue({
      projectDir: "/fake/project",
      commands: [
        { name: "review", path: "/fake/review.md", dialect: "mason" },
      ],
      skills: [],
      mcpServers: [],
      systemPrompt: undefined,
    });

    const role = makeRole({
      tasks: [{ name: "deploy/*" }],
    });

    const result = await resolveRoleFields(role, "/fake/project");

    expect(result.tasks).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Pattern "deploy/*" matched no tasks'),
    );

    warnSpy.mockRestore();
  });
});
