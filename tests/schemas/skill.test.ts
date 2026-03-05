import { describe, it, expect } from "vitest";
import { skillForgeFieldSchema } from "../../src/schemas/skill.js";

describe("skillForgeFieldSchema", () => {
  it("validates a valid skill", () => {
    const result = skillForgeFieldSchema.safeParse({
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
    const result = skillForgeFieldSchema.safeParse({
      type: "skill",
      description: "Missing artifacts",
    });
    expect(result.success).toBe(false);
  });

  it("rejects skill with empty artifacts array", () => {
    const result = skillForgeFieldSchema.safeParse({
      type: "skill",
      artifacts: [],
      description: "Empty artifacts",
    });
    expect(result.success).toBe(false);
  });

  it("rejects skill missing description", () => {
    const result = skillForgeFieldSchema.safeParse({
      type: "skill",
      artifacts: ["./SKILL.md"],
    });
    expect(result.success).toBe(false);
  });

  it("validates PRD example: @clawforge/skill-labeling", () => {
    const result = skillForgeFieldSchema.safeParse({
      type: "skill",
      artifacts: ["./SKILL.md", "./examples/", "./schemas/"],
      description: "Issue labeling taxonomy and heuristics",
    });
    expect(result.success).toBe(true);
  });
});
