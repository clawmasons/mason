import { describe, it, expect } from "vitest";
import { taskFieldSchema } from "@clawmasons/shared";

describe("taskFieldSchema", () => {
  it("validates a minimal task with just type", () => {
    const result = taskFieldSchema.safeParse({
      type: "task",
    });
    expect(result.success).toBe(true);
  });

  it("validates a task with prompt", () => {
    const result = taskFieldSchema.safeParse({
      type: "task",
      prompt: "./prompts/triage.md",
    });
    expect(result.success).toBe(true);
  });

  it("validates a task with description", () => {
    const result = taskFieldSchema.safeParse({
      type: "task",
      description: "Triage incoming issues",
    });
    expect(result.success).toBe(true);
  });

  it("validates a task with all fields", () => {
    const result = taskFieldSchema.safeParse({
      type: "task",
      prompt: "./prompts/triage.md",
      description: "Triage incoming issues",
    });
    expect(result.success).toBe(true);
  });

  it("rejects task with wrong type literal", () => {
    const result = taskFieldSchema.safeParse({
      type: "skill",
    });
    expect(result.success).toBe(false);
  });

  it("rejects task with missing type", () => {
    const result = taskFieldSchema.safeParse({
      prompt: "./prompts/triage.md",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-string prompt", () => {
    const result = taskFieldSchema.safeParse({
      type: "task",
      prompt: 123,
    });
    expect(result.success).toBe(false);
  });
});
