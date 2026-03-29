import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@clawmasons/shared";

// Mock discovery before importing the module under test
vi.mock("../../src/role/discovery.js", () => ({
  resolveRole: vi.fn(),
  RoleDiscoveryError: class extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = "RoleDiscoveryError";
    }
  },
}));

import { resolveIncludes, RoleIncludeError } from "../../src/role/includes.js";
import { resolveRole } from "../../src/role/discovery.js";

const mockedResolveRole = vi.mocked(resolveRole);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRole(overrides: Partial<Role> & { metadata: Role["metadata"] }): Role {
  return {
    instructions: "",
    type: "project",
    tasks: [],
    mcp: [],
    skills: [],
    sources: [],
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

/** No-op wildcard expansion — returns role unchanged */
const noopExpandWildcards = async (role: Role): Promise<Role> => role;

// ---------------------------------------------------------------------------
// Tests — PRD §11.4 tests 8-11
// ---------------------------------------------------------------------------

describe("resolveIncludes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns role unchanged when includes is empty", async () => {
    const role = makeRole({
      metadata: { name: "project", description: "Project role" },
      role: { includes: [] },
    });

    const result = await resolveIncludes(role, "/fake/project", noopExpandWildcards);

    expect(result).toEqual(role);
    expect(mockedResolveRole).not.toHaveBeenCalled();
  });

  it("test 8: multiple includes ordering — second include sees first merged result", async () => {
    const baseRole = makeRole({
      metadata: { name: "base-role", description: "Base" },
      tasks: [{ name: "base-task" }],
      instructions: "Base instructions",
    });
    const securityRole = makeRole({
      metadata: { name: "security", description: "Security" },
      tasks: [{ name: "security-task" }, { name: "base-task" }], // base-task should be deduped
      instructions: "Security instructions",
    });

    mockedResolveRole
      .mockResolvedValueOnce(baseRole)
      .mockResolvedValueOnce(securityRole);

    const role = makeRole({
      metadata: { name: "project", description: "Project" },
      tasks: [{ name: "my-task" }],
      instructions: "Project instructions",
      role: { includes: ["base-role", "security"] },
    });

    const result = await resolveIncludes(role, "/fake/project", noopExpandWildcards);

    // Tasks: my-task (current) + base-task (from base-role) + security-task (from security)
    // base-task from security is deduped since it was already added by base-role merge
    expect(result.tasks.map((t) => t.name)).toEqual([
      "my-task",
      "base-task",
      "security-task",
    ]);
    // Instructions: project + base + security
    expect(result.instructions).toBe(
      "Project instructions\n\nBase instructions\n\nSecurity instructions",
    );
  });

  it("test 9: circular detection — A includes B, B includes A", async () => {
    const roleB = makeRole({
      metadata: { name: "role-b", description: "Role B" },
      role: { includes: ["role-a"] },
    });

    // Use mockResolvedValue (not Once) since it may be called multiple times
    mockedResolveRole.mockResolvedValue(roleB);

    const roleA = makeRole({
      metadata: { name: "role-a", description: "Role A" },
      role: { includes: ["role-b"] },
    });

    // Verify error type, message, and chain in one assertion
    try {
      await resolveIncludes(roleA, "/fake/project", noopExpandWildcards);
      expect.fail("Should have thrown RoleIncludeError");
    } catch (err) {
      expect(err).toBeInstanceOf(RoleIncludeError);
      expect((err as Error).message).toMatch(/Circular role inclusion detected/);
      expect((err as Error).message).toMatch(/role-a.*role-b.*role-a/);
    }
  });

  it("test 10: transitive includes — A includes B, B includes C", async () => {
    const roleC = makeRole({
      metadata: { name: "role-c", description: "Role C" },
      tasks: [{ name: "task-c" }],
    });
    const roleB = makeRole({
      metadata: { name: "role-b", description: "Role B" },
      tasks: [{ name: "task-b" }],
      role: { includes: ["role-c"] },
    });

    mockedResolveRole
      .mockResolvedValueOnce(roleB) // A resolves B
      .mockResolvedValueOnce(roleC); // B resolves C

    const roleA = makeRole({
      metadata: { name: "role-a", description: "Role A" },
      tasks: [{ name: "task-a" }],
      role: { includes: ["role-b"] },
    });

    const result = await resolveIncludes(roleA, "/fake/project", noopExpandWildcards);

    // A's tasks + B's tasks + C's tasks
    expect(result.tasks.map((t) => t.name)).toEqual([
      "task-a",
      "task-b",
      "task-c",
    ]);
  });

  it("test 11: depth limit — chain of 11 includes fails", async () => {
    // Create a chain: role-0 includes role-1, role-1 includes role-2, ..., role-10 includes role-11
    // This should fail at depth 10 (0-indexed)
    for (let i = 1; i <= 11; i++) {
      const nextIncludes = i < 11 ? [`role-${i + 1}`] : [];
      mockedResolveRole.mockResolvedValueOnce(
        makeRole({
          metadata: { name: `role-${i}`, description: `Role ${i}` },
          role: { includes: nextIncludes },
        }),
      );
    }

    const rootRole = makeRole({
      metadata: { name: "role-0", description: "Root" },
      role: { includes: ["role-1"] },
    });

    await expect(
      resolveIncludes(rootRole, "/fake/project", noopExpandWildcards),
    ).rejects.toThrow(/Role inclusion depth exceeds maximum \(10\)/);
  });

  it("calls expandWildcards on included roles", async () => {
    const includedRole = makeRole({
      metadata: { name: "included", description: "Included" },
      tasks: [{ name: "*" }], // wildcard that would be expanded
    });

    mockedResolveRole.mockResolvedValue(includedRole);

    const expandSpy = vi.fn(async (role: Role): Promise<Role> => ({
      ...role,
      tasks: [{ name: "expanded-task" }], // simulate wildcard expansion
    }));

    const role = makeRole({
      metadata: { name: "project", description: "Project" },
      role: { includes: ["included"] },
    });

    const result = await resolveIncludes(role, "/fake/project", expandSpy);

    expect(expandSpy).toHaveBeenCalledOnce();
    expect(expandSpy.mock.calls[0][0].metadata.name).toBe("included");
    expect(expandSpy.mock.calls[0][1]).toBe("/fake/project");
    expect(result.tasks.map((t) => t.name)).toEqual(["expanded-task"]);
  });

  it("uses project directory for resolveRole lookups", async () => {
    const includedRole = makeRole({
      metadata: { name: "included", description: "Included" },
      source: { type: "package", packageName: "@clawmasons/role-included" },
    });

    mockedResolveRole.mockResolvedValue(includedRole);

    const role = makeRole({
      metadata: { name: "project", description: "Project" },
      role: { includes: ["@clawmasons/role-included"] },
    });

    await resolveIncludes(role, "/user/project", noopExpandWildcards);

    // resolveRole should be called with the user's project directory
    expect(mockedResolveRole).toHaveBeenCalledWith(
      "@clawmasons/role-included",
      "/user/project",
    );
  });
});
