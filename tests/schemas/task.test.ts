import { describe, it, expect } from "vitest";
import { taskPamFieldSchema } from "../../src/schemas/task.js";

describe("taskPamFieldSchema", () => {
  it("validates a valid subagent task", () => {
    const result = taskPamFieldSchema.safeParse({
      type: "task",
      taskType: "subagent",
      prompt: "./prompts/triage.md",
      requires: {
        apps: ["@clawforge/app-github"],
        skills: ["@clawforge/skill-labeling"],
      },
      timeout: "5m",
      approval: "auto",
    });
    expect(result.success).toBe(true);
  });

  it("validates a composite task", () => {
    const result = taskPamFieldSchema.safeParse({
      type: "task",
      taskType: "composite",
    });
    expect(result.success).toBe(true);
  });

  it("validates a script task", () => {
    const result = taskPamFieldSchema.safeParse({
      type: "task",
      taskType: "script",
    });
    expect(result.success).toBe(true);
  });

  it("validates a human task", () => {
    const result = taskPamFieldSchema.safeParse({
      type: "task",
      taskType: "human",
      prompt: "./prompts/approval.md",
    });
    expect(result.success).toBe(true);
  });

  it("rejects task with invalid taskType", () => {
    const result = taskPamFieldSchema.safeParse({
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
    const result = taskPamFieldSchema.safeParse({
      type: "task",
      taskType: "subagent",
      requires: { apps: ["@clawforge/app-github"] },
    });
    expect(result.success).toBe(true);
  });

  it("validates PRD example: @clawforge/task-triage-issue", () => {
    const result = taskPamFieldSchema.safeParse({
      type: "task",
      taskType: "subagent",
      prompt: "./prompts/triage.md",
      requires: {
        apps: ["@clawforge/app-github"],
        skills: ["@clawforge/skill-labeling"],
      },
      timeout: "5m",
      approval: "auto",
    });
    expect(result.success).toBe(true);
  });
});
