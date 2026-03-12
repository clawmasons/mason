import { z } from "zod";
import { appChapterFieldSchema, type AppChapterField } from "./app.js";
import { skillChapterFieldSchema, type SkillChapterField } from "./skill.js";
import { taskChapterFieldSchema, type TaskChapterField } from "./task.js";
import { roleChapterFieldSchema, type RoleChapterField } from "./role.js";

export type ChapterField =
  | AppChapterField
  | SkillChapterField
  | TaskChapterField
  | RoleChapterField;

const chapterTypeValues = ["app", "skill", "task", "role"] as const;

const schemasByType: Record<string, z.ZodType> = {
  app: appChapterFieldSchema,
  skill: skillChapterFieldSchema,
  task: taskChapterFieldSchema,
  role: roleChapterFieldSchema,
};

export function parseChapterField(input: unknown): z.SafeParseReturnType<unknown, ChapterField> {
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
    } as z.SafeParseError<ChapterField>;
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
    } as z.SafeParseError<ChapterField>;
  }

  const schema = schemasByType[obj.type];
  if (!schema) {
    return {
      success: false,
      error: new z.ZodError([
        {
          code: z.ZodIssueCode.invalid_enum_value,
          options: [...chapterTypeValues],
          received: obj.type,
          path: ["type"],
          message: `Invalid discriminator value. Expected ${chapterTypeValues.map((t) => `'${t}'`).join(" | ")}`,
        },
      ]),
    } as z.SafeParseError<ChapterField>;
  }

  return schema.safeParse(input) as z.SafeParseReturnType<unknown, ChapterField>;
}
