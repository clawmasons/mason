import { z } from "zod";

export const skillPamFieldSchema = z.object({
  type: z.literal("skill"),
  artifacts: z.array(z.string()).min(1),
  description: z.string(),
});

export type SkillPamField = z.infer<typeof skillPamFieldSchema>;
