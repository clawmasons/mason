import { describe, it, expect } from "vitest";
import { taskForgeFieldSchema } from "../../src/schemas/task.js";

describe("taskForgeFieldSchema", () => {
  it("validates a valid subagent task", () => {
    const result = taskForgeFieldSchema.safeParse({
      type: "task",
      taskType: "subagent",
      prompt: "./prompts/triage.md",
      requires: {
        apps: ["@clawmasons/app-github"],
        skills: ["@clawmasons/skill-labeling"],
      },
      timeout: "5m",
      approval: "auto",
    });
    expect(result.success).toBe(true);
  });

  it("validates a composite task", () => {
    const result = taskForgeFieldSchema.safeParse({
      type: "task",
      taskType: "composite",
    });
    expect(result.success).toBe(true);
  });

  it("validates a script task", () => {
    const result = taskForgeFieldSchema.safeParse({
      type: "task",
      taskType: "script",
    });
    expect(result.success).toBe(true);
  });

  it("validates a human task", () => {
    const result = taskForgeFieldSchema.safeParse({
      type: "task",
      taskType: "human",
      prompt: "./prompts/approval.md",
    });
    expect(result.success).toBe(true);
  });

  it("rejects task with invalid taskType", () => {
    const result = taskForgeFieldSchema.safeParse({
      type: "task",
      taskType: "unknown",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const message = result.error.issues[0].message;
      expect(message).toContain("Invalid enum value");
    }
  });

  it("accepts task with partial requires", () => {
    const result = taskForgeFieldSchema.safeParse({
      type: "task",
      taskType: "subagent",
      requires: { apps: ["@clawmasons/app-github"] },
    });
    expect(result.success).toBe(true);
  });

  it("validates PRD example: @clawmasons/task-triage-issue", () => {
    const result = taskForgeFieldSchema.safeParse({
      type: "task",
      taskType: "subagent",
      prompt: "./prompts/triage.md",
      requires: {
        apps: ["@clawmasons/app-github"],
        skills: ["@clawmasons/skill-labeling"],
      },
      timeout: "5m",
      approval: "auto",
    });
    expect(result.success).toBe(true);
  });
});
