import { describe, expect, it } from "vitest";
import { computeToolFilters, getAppShortName } from "../../src/generator/toolfilter.js";
import type { ResolvedMember } from "../../src/resolver/types.js";

function makeMember(overrides: Partial<ResolvedMember> = {}): ResolvedMember {
  return {
    name: "@clawmasons/member-repo-ops",
    version: "1.0.0",
    memberType: "agent",
    memberName: "Repo Ops",
    slug: "repo-ops",
    email: "repo-ops@chapter.local",
    authProviders: [],
    runtimes: ["claude-code"],
    roles: [],
    ...overrides,
  };
}

describe("getAppShortName", () => {
  it("strips scope and app- prefix", () => {
    expect(getAppShortName("@clawmasons/app-github")).toBe("github");
  });

  it("strips scope but preserves name without app- prefix", () => {
    expect(getAppShortName("@clawmasons/slack-server")).toBe("slack-server");
  });

  it("strips app- prefix from unscoped package", () => {
    expect(getAppShortName("app-github")).toBe("github");
  });

  it("returns name as-is for unscoped package without type prefix", () => {
    expect(getAppShortName("myserver")).toBe("myserver");
  });

  it("strips member- prefix from scoped package", () => {
    expect(getAppShortName("@clawmasons/member-note-taker")).toBe("note-taker");
  });

  it("strips agent- prefix from scoped package", () => {
    expect(getAppShortName("@clawmasons/agent-repo-ops")).toBe("repo-ops");
  });

  it("strips role- prefix from scoped package", () => {
    expect(getAppShortName("@clawmasons/role-issue-manager")).toBe("issue-manager");
  });
});

describe("computeToolFilters", () => {
  it("returns empty map for member with no roles", () => {
    const member = makeMember({ roles: [] });
    const filters = computeToolFilters(member);
    expect(filters.size).toBe(0);
  });

  it("computes toolFilter for single role with one app", () => {
    const member = makeMember({
      roles: [
        {
          name: "@clawmasons/role-issue-manager",
          version: "1.0.0",
          permissions: {
            "@clawmasons/app-github": {
              allow: ["create_issue", "list_repos", "add_label"],
              deny: ["delete_repo"],
            },
          },
          tasks: [],
          apps: [],
          skills: [],
        },
      ],
    });

    const filters = computeToolFilters(member);
    expect(filters.size).toBe(1);

    const github = filters.get("@clawmasons/app-github");
    expect(github).toBeDefined();
    expect(github?.mode).toBe("allow");
    expect(github?.list).toEqual(["create_issue", "list_repos", "add_label"]);
  });

  it("computes union of allow-lists across multiple roles for same app", () => {
    const member = makeMember({
      roles: [
        {
          name: "@clawmasons/role-issue-manager",
          version: "1.0.0",
          permissions: {
            "@clawmasons/app-github": {
              allow: ["create_issue", "list_repos", "add_label"],
              deny: [],
            },
          },
          tasks: [],
          apps: [],
          skills: [],
        },
        {
          name: "@clawmasons/role-pr-reviewer",
          version: "1.0.0",
          permissions: {
            "@clawmasons/app-github": {
              allow: ["list_repos", "get_pr", "create_review"],
              deny: [],
            },
          },
          tasks: [],
          apps: [],
          skills: [],
        },
      ],
    });

    const filters = computeToolFilters(member);
    const github = filters.get("@clawmasons/app-github");
    expect(github).toBeDefined();
    expect(github?.mode).toBe("allow");
    expect(github?.list).toHaveLength(5);
    expect(new Set(github?.list)).toEqual(
      new Set(["create_issue", "list_repos", "add_label", "get_pr", "create_review"]),
    );
  });

  it("handles multiple apps across roles", () => {
    const member = makeMember({
      roles: [
        {
          name: "@clawmasons/role-issue-manager",
          version: "1.0.0",
          permissions: {
            "@clawmasons/app-github": {
              allow: ["create_issue", "list_repos", "add_label"],
              deny: [],
            },
            "@clawmasons/app-slack": {
              allow: ["send_message"],
              deny: ["*"],
            },
          },
          tasks: [],
          apps: [],
          skills: [],
        },
        {
          name: "@clawmasons/role-pr-reviewer",
          version: "1.0.0",
          permissions: {
            "@clawmasons/app-github": {
              allow: ["list_repos", "get_pr", "create_review"],
              deny: [],
            },
          },
          tasks: [],
          apps: [],
          skills: [],
        },
      ],
    });

    const filters = computeToolFilters(member);
    expect(filters.size).toBe(2);

    const github = filters.get("@clawmasons/app-github");
    expect(github).toBeDefined();
    expect(new Set(github?.list)).toEqual(
      new Set(["create_issue", "list_repos", "add_label", "get_pr", "create_review"]),
    );

    const slack = filters.get("@clawmasons/app-slack");
    expect(slack).toBeDefined();
    expect(slack?.list).toEqual(["send_message"]);
  });

  it("excludes tools not in any role's allow-list", () => {
    const member = makeMember({
      roles: [
        {
          name: "@clawmasons/role-issue-manager",
          version: "1.0.0",
          permissions: {
            "@clawmasons/app-github": {
              allow: ["create_issue", "list_repos", "add_label"],
              deny: ["delete_repo", "transfer_repo"],
            },
          },
          tasks: [],
          apps: [],
          skills: [],
        },
      ],
    });

    const filters = computeToolFilters(member);
    const github = filters.get("@clawmasons/app-github");
    expect(github).toBeDefined();
    expect(github?.list).not.toContain("delete_repo");
    expect(github?.list).not.toContain("transfer_repo");
    expect(github?.list).toHaveLength(3);
  });

  it("deduplicates tools in the union", () => {
    const member = makeMember({
      roles: [
        {
          name: "role-a",
          version: "1.0.0",
          permissions: {
            "app-x": { allow: ["tool1", "tool2"], deny: [] },
          },
          tasks: [],
          apps: [],
          skills: [],
        },
        {
          name: "role-b",
          version: "1.0.0",
          permissions: {
            "app-x": { allow: ["tool2", "tool3"], deny: [] },
          },
          tasks: [],
          apps: [],
          skills: [],
        },
      ],
    });

    const filters = computeToolFilters(member);
    const x = filters.get("app-x");
    expect(x).toBeDefined();
    expect(x?.list).toHaveLength(3);
    expect(new Set(x?.list)).toEqual(new Set(["tool1", "tool2", "tool3"]));
  });

  it("all toolFilters have mode: allow", () => {
    const member = makeMember({
      roles: [
        {
          name: "role-a",
          version: "1.0.0",
          permissions: {
            "app-x": { allow: ["tool1"], deny: [] },
            "app-y": { allow: ["tool2"], deny: [] },
          },
          tasks: [],
          apps: [],
          skills: [],
        },
      ],
    });

    const filters = computeToolFilters(member);
    for (const [, filter] of filters) {
      expect(filter.mode).toBe("allow");
    }
  });
});
