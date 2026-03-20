import { z } from "zod";

export const taskFieldSchema = z.object({
  type: z.literal("task"),
  taskType: z.enum(["subagent", "script", "composite", "human"]),
  prompt: z.string().optional(),
  requires: z
    .object({
      apps: z.array(z.string()).optional(),
      skills: z.array(z.string()).optional(),
    })
    .optional(),
  tasks: z.array(z.string()).optional(),
  timeout: z.string().optional(),
  approval: z.enum(["auto", "confirm", "review"]).optional(),
});

export type TaskField = z.infer<typeof taskFieldSchema>;
