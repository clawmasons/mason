import { z } from "zod";
import { appForgeFieldSchema, type AppForgeField } from "./app.js";
import { skillForgeFieldSchema, type SkillForgeField } from "./skill.js";
import { taskForgeFieldSchema, type TaskForgeField } from "./task.js";
import { roleForgeFieldSchema, type RoleForgeField } from "./role.js";
import { agentForgeFieldSchema, type AgentForgeField } from "./agent.js";

export type ForgeField =
  | AppForgeField
  | SkillForgeField
  | TaskForgeField
  | RoleForgeField
  | AgentForgeField;

const forgeTypeValues = ["app", "skill", "task", "role", "agent"] as const;

const schemasByType: Record<string, z.ZodType> = {
  app: appForgeFieldSchema,
  skill: skillForgeFieldSchema,
  task: taskForgeFieldSchema,
  role: roleForgeFieldSchema,
  agent: agentForgeFieldSchema,
};

export function parseForgeField(input: unknown): z.SafeParseReturnType<unknown, ForgeField> {
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
    } as z.SafeParseError<ForgeField>;
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
    } as z.SafeParseError<ForgeField>;
  }

  const schema = schemasByType[obj.type];
  if (!schema) {
    return {
      success: false,
      error: new z.ZodError([
        {
          code: z.ZodIssueCode.invalid_enum_value,
          options: [...forgeTypeValues],
          received: obj.type,
          path: ["type"],
          message: `Invalid discriminator value. Expected ${forgeTypeValues.map((t) => `'${t}'`).join(" | ")}`,
        },
      ]),
    } as z.SafeParseError<ForgeField>;
  }

  return schema.safeParse(input) as z.SafeParseReturnType<unknown, ForgeField>;
}
