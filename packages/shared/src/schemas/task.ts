import { z } from "zod";

export const taskFieldSchema = z.object({
  type: z.literal("task"),
  prompt: z.string().optional(),
  description: z.string().optional(),
});

export type TaskField = z.infer<typeof taskFieldSchema>;
