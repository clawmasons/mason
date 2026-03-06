import { describe, it, expect } from "vitest";
import { skillChapterFieldSchema } from "../../src/schemas/skill.js";

describe("skillChapterFieldSchema", () => {
  it("validates a valid skill", () => {
    const result = skillChapterFieldSchema.safeParse({
      type: "skill",
      artifacts: ["./SKILL.md", "./examples/"],
      description: "Issue labeling taxonomy and heuristics",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.artifacts).toEqual(["./SKILL.md", "./examples/"]);
      expect(result.data.description).toBe(
        "Issue labeling taxonomy and heuristics",
      );
    }
  });

  it("rejects skill missing artifacts", () => {
    const result = skillChapterFieldSchema.safeParse({
      type: "skill",
      description: "Missing artifacts",
    });
    expect(result.success).toBe(false);
  });

  it("rejects skill with empty artifacts array", () => {
    const result = skillChapterFieldSchema.safeParse({
      type: "skill",
      artifacts: [],
      description: "Empty artifacts",
    });
    expect(result.success).toBe(false);
  });

  it("rejects skill missing description", () => {
    const result = skillChapterFieldSchema.safeParse({
      type: "skill",
      artifacts: ["./SKILL.md"],
    });
    expect(result.success).toBe(false);
  });

  it("validates PRD example: @clawmasons/skill-labeling", () => {
    const result = skillChapterFieldSchema.safeParse({
      type: "skill",
      artifacts: ["./SKILL.md", "./examples/", "./schemas/"],
      description: "Issue labeling taxonomy and heuristics",
    });
    expect(result.success).toBe(true);
  });
});
