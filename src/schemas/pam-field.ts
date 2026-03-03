import { z } from "zod";
import { appPamFieldSchema, type AppPamField } from "./app.js";
import { skillPamFieldSchema, type SkillPamField } from "./skill.js";
import { taskPamFieldSchema, type TaskPamField } from "./task.js";
import { rolePamFieldSchema, type RolePamField } from "./role.js";
import { agentPamFieldSchema, type AgentPamField } from "./agent.js";

export type PamField =
  | AppPamField
  | SkillPamField
  | TaskPamField
  | RolePamField
  | AgentPamField;

const pamTypeValues = ["app", "skill", "task", "role", "agent"] as const;

const schemasByType: Record<string, z.ZodType> = {
  app: appPamFieldSchema,
  skill: skillPamFieldSchema,
  task: taskPamFieldSchema,
  role: rolePamFieldSchema,
  agent: agentPamFieldSchema,
};

export function parsePamField(input: unknown): z.SafeParseReturnType<unknown, PamField> {
  if (input === null || typeof input !== "object") {
    return {
      success: false,
      error: new z.ZodError([
        {
          code: z.ZodIssueCode.invalid_type,
          expected: "object",
          received: input === null ? "null" : typeof input,
          path: [],
          message: "Expected object, received " + (input === null ? "null" : typeof input),
        },
      ]),
    } as z.SafeParseError<PamField>;
  }

  const obj = input as Record<string, unknown>;
  if (!("type" in obj) || typeof obj.type !== "string") {
    return {
      success: false,
      error: new z.ZodError([
        {
          code: z.ZodIssueCode.invalid_type,
          expected: "string",
          received: obj.type === undefined ? "undefined" : typeof obj.type,
          path: ["type"],
          message: "Required",
        },
      ]),
    } as z.SafeParseError<PamField>;
  }

  const schema = schemasByType[obj.type];
  if (!schema) {
    return {
      success: false,
      error: new z.ZodError([
        {
          code: z.ZodIssueCode.invalid_enum_value,
          options: [...pamTypeValues],
          received: obj.type,
          path: ["type"],
          message: `Invalid discriminator value. Expected ${pamTypeValues.map((t) => `'${t}'`).join(" | ")}`,
        },
      ]),
    } as z.SafeParseError<PamField>;
  }

  return schema.safeParse(input) as z.SafeParseReturnType<unknown, PamField>;
}
