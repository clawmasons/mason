import { z } from "zod";
import { appFieldSchema, type AppField } from "./app.js";
import { skillFieldSchema, type SkillField } from "./skill.js";
import { taskFieldSchema, type TaskField } from "./task.js";
import { roleFieldSchema, type RoleField } from "./role.js";

export type Field =
  | AppField
  | SkillField
  | TaskField
  | RoleField;

const fieldTypeValues = ["app", "skill", "task", "role"] as const;

const schemasByType: Record<string, z.ZodType> = {
  app: appFieldSchema,
  skill: skillFieldSchema,
  task: taskFieldSchema,
  role: roleFieldSchema,
};

export function parseField(input: unknown): z.SafeParseReturnType<unknown, Field> {
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
    } as z.SafeParseError<Field>;
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
    } as z.SafeParseError<Field>;
  }

  const schema = schemasByType[obj.type];
  if (!schema) {
    return {
      success: false,
      error: new z.ZodError([
        {
          code: z.ZodIssueCode.invalid_enum_value,
          options: [...fieldTypeValues],
          received: obj.type,
          path: ["type"],
          message: `Invalid discriminator value. Expected ${fieldTypeValues.map((t) => `'${t}'`).join(" | ")}`,
        },
      ]),
    } as z.SafeParseError<Field>;
  }

  return schema.safeParse(input) as z.SafeParseReturnType<unknown, Field>;
}
