import { describe, it, expect } from "vitest";
import {
  isWildcardPattern,
  validatePattern,
  matchWildcard,
  expandTaskWildcards,
  expandSkillWildcards,
  WildcardPatternError,
} from "@clawmasons/shared";
import type { TaskRef, SkillRef } from "@clawmasons/shared";
import type { DiscoveredCommand, DiscoveredSkill } from "@clawmasons/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cmd(name: string): DiscoveredCommand {
  return { name, path: `/fake/${name}.md`, dialect: "mason" };
}

function skill(name: string): DiscoveredSkill {
  return { name, path: `/fake/skills/${name}`, dialect: "mason" };
}

function taskRef(name: string): TaskRef {
  return { name };
}

function skillRef(name: string): SkillRef {
  return { name };
}

// ---------------------------------------------------------------------------
// isWildcardPattern
// ---------------------------------------------------------------------------

describe("isWildcardPattern", () => {
  it("returns true for bare *", () => {
    expect(isWildcardPattern("*")).toBe(true);
  });

  it("returns true for scoped wildcard", () => {
    expect(isWildcardPattern("deploy/*")).toBe(true);
  });

  it("returns false for plain name", () => {
    expect(isWildcardPattern("review")).toBe(false);
  });

  it("returns false for path without wildcard", () => {
    expect(isWildcardPattern("deploy/staging")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validatePattern
// ---------------------------------------------------------------------------

describe("validatePattern", () => {
  it("accepts bare *", () => {
    expect(() => validatePattern("*")).not.toThrow();
  });

  it("accepts scoped wildcard", () => {
    expect(() => validatePattern("deploy/*")).not.toThrow();
  });

  it("rejects **", () => {
    expect(() => validatePattern("**")).toThrow(WildcardPatternError);
    expect(() => validatePattern("deploy/**")).toThrow(WildcardPatternError);
  });

  it("rejects ?", () => {
    expect(() => validatePattern("deploy/?")).toThrow(WildcardPatternError);
  });

  it("rejects [...]", () => {
    expect(() => validatePattern("[a-z]")).toThrow(WildcardPatternError);
    expect(() => validatePattern("deploy/[staging]")).toThrow(WildcardPatternError);
  });
});

// ---------------------------------------------------------------------------
// matchWildcard
// ---------------------------------------------------------------------------

describe("matchWildcard", () => {
  it("bare * matches everything including nested paths", () => {
    expect(matchWildcard("*", "review")).toBe(true);
    expect(matchWildcard("*", "deploy/staging")).toBe(true);
    expect(matchWildcard("*", "deploy/sub/deep")).toBe(true);
  });

  it("scoped deploy/* matches deploy/staging and deploy/production", () => {
    expect(matchWildcard("deploy/*", "deploy/staging")).toBe(true);
    expect(matchWildcard("deploy/*", "deploy/production")).toBe(true);
  });

  it("scoped deploy/* does NOT match review", () => {
    expect(matchWildcard("deploy/*", "review")).toBe(false);
  });

  it("scoped deploy/* does NOT match deploy/sub/deep", () => {
    expect(matchWildcard("deploy/*", "deploy/sub/deep")).toBe(false);
  });

  it("scoped ops/monitoring/* matches ops/monitoring/alerts", () => {
    expect(matchWildcard("ops/monitoring/*", "ops/monitoring/alerts")).toBe(true);
  });

  it("scoped ops/* does NOT match ops/monitoring/alerts", () => {
    expect(matchWildcard("ops/*", "ops/monitoring/alerts")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// expandTaskWildcards
// ---------------------------------------------------------------------------

describe("expandTaskWildcards", () => {
  const discovered: DiscoveredCommand[] = [
    cmd("review"),
    cmd("deploy/staging"),
    cmd("deploy/production"),
    cmd("build"),
  ];

  // PRD test 12: Bare wildcard matches ALL discovered tasks
  it("bare * matches ALL discovered tasks regardless of scope", () => {
    const { expanded, warnings } = expandTaskWildcards(
      [taskRef("*")],
      discovered,
    );
    expect(expanded.map((t) => t.name)).toEqual([
      "review",
      "deploy/staging",
      "deploy/production",
      "build",
    ]);
    expect(warnings).toEqual([]);
  });

  // PRD test 13: Scoped wildcard matches scope
  it("scoped deploy/* matches deploy/staging and deploy/production but not review", () => {
    const { expanded, warnings } = expandTaskWildcards(
      [taskRef("deploy/*")],
      discovered,
    );
    expect(expanded.map((t) => t.name)).toEqual([
      "deploy/staging",
      "deploy/production",
    ]);
    expect(warnings).toEqual([]);
  });

  // PRD test 14: Scoped wildcard does not cross boundaries
  it("scoped deploy/* does NOT match deploy/sub/deep", () => {
    const discoveredWithDeep = [
      ...discovered,
      cmd("deploy/sub/deep"),
    ];
    const { expanded } = expandTaskWildcards(
      [taskRef("deploy/*")],
      discoveredWithDeep,
    );
    expect(expanded.map((t) => t.name)).toEqual([
      "deploy/staging",
      "deploy/production",
    ]);
  });

  // PRD test 15: Mixed list
  it("mixed list with explicit and scoped wildcard", () => {
    const { expanded } = expandTaskWildcards(
      [taskRef("review"), taskRef("deploy/*")],
      discovered,
    );
    expect(expanded.map((t) => t.name)).toEqual([
      "review",
      "deploy/staging",
      "deploy/production",
    ]);
  });

  // PRD test 16: Deduplication
  it("deduplicates: explicit review + * → review appears once", () => {
    const { expanded } = expandTaskWildcards(
      [taskRef("review"), taskRef("*")],
      discovered,
    );
    expect(expanded.map((t) => t.name)).toEqual([
      "review",
      "deploy/staging",
      "deploy/production",
      "build",
    ]);
    // review appears exactly once (first-wins)
    expect(expanded.filter((t) => t.name === "review")).toHaveLength(1);
  });

  // PRD test 17: Zero matches → warning
  it("zero matches produces warning", () => {
    const { expanded, warnings } = expandTaskWildcards(
      [taskRef("deploy/*")],
      [cmd("review"), cmd("build")],
    );
    expect(expanded).toEqual([]);
    expect(warnings).toEqual([
      'Pattern "deploy/*" matched no tasks in source directories.',
    ]);
  });

  // PRD test 18: No wildcard → pass through
  it("no wildcard passes through as-is", () => {
    const { expanded, warnings } = expandTaskWildcards(
      [taskRef("review")],
      discovered,
    );
    expect(expanded).toEqual([taskRef("review")]);
    expect(warnings).toEqual([]);
  });

  // PRD test 19: Invalid syntax → error
  it("invalid syntax ** throws WildcardPatternError", () => {
    expect(() =>
      expandTaskWildcards([taskRef("**")], discovered),
    ).toThrow(WildcardPatternError);
  });

  it("invalid syntax deploy/? throws WildcardPatternError", () => {
    expect(() =>
      expandTaskWildcards([taskRef("deploy/?")], discovered),
    ).toThrow(WildcardPatternError);
  });

  it("invalid syntax [a-z] throws WildcardPatternError", () => {
    expect(() =>
      expandTaskWildcards([taskRef("[a-z]")], discovered),
    ).toThrow(WildcardPatternError);
  });

  // PRD test 23: Wildcard with explicit entries → all discovered
  it("wildcard * with explicit entries includes all discovered", () => {
    const { expanded } = expandTaskWildcards(
      [taskRef("review"), taskRef("*")],
      discovered,
    );
    // All discovered are present, review is first (explicit), rest follow
    expect(expanded.map((t) => t.name)).toEqual([
      "review",
      "deploy/staging",
      "deploy/production",
      "build",
    ]);
  });

  // Empty tasks → no expansion needed
  it("empty tasks array returns empty", () => {
    const { expanded, warnings } = expandTaskWildcards([], discovered);
    expect(expanded).toEqual([]);
    expect(warnings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// expandSkillWildcards
// ---------------------------------------------------------------------------

describe("expandSkillWildcards", () => {
  const discoveredSkills: DiscoveredSkill[] = [
    skill("testing"),
    skill("linting"),
    skill("documentation"),
  ];

  // PRD test 20: Skills wildcard discovers all skills
  it("bare * discovers all skills from source directories", () => {
    const { expanded, warnings } = expandSkillWildcards(
      [skillRef("*")],
      discoveredSkills,
    );
    expect(expanded.map((s) => s.name)).toEqual([
      "testing",
      "linting",
      "documentation",
    ]);
    expect(warnings).toEqual([]);
  });

  it("non-wildcard skill passes through", () => {
    const { expanded } = expandSkillWildcards(
      [skillRef("testing")],
      discoveredSkills,
    );
    expect(expanded).toEqual([skillRef("testing")]);
  });

  it("deduplicates skills", () => {
    const { expanded } = expandSkillWildcards(
      [skillRef("testing"), skillRef("*")],
      discoveredSkills,
    );
    expect(expanded.map((s) => s.name)).toEqual([
      "testing",
      "linting",
      "documentation",
    ]);
  });

  it("zero matches produces warning", () => {
    const { expanded, warnings } = expandSkillWildcards(
      [skillRef("missing/*")],
      discoveredSkills,
    );
    expect(expanded).toEqual([]);
    expect(warnings).toHaveLength(1);
  });
});
