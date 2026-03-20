import { z } from "zod";

export const skillFieldSchema = z.object({
  type: z.literal("skill"),
  artifacts: z.array(z.string()).min(1),
  description: z.string(),
});

export type SkillField = z.infer<typeof skillFieldSchema>;
