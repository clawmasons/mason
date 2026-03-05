import { z } from "zod";

export const skillForgeFieldSchema = z.object({
  type: z.literal("skill"),
  artifacts: z.array(z.string()).min(1),
  description: z.string(),
});

export type SkillForgeField = z.infer<typeof skillForgeFieldSchema>;
