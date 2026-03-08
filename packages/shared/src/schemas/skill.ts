import { z } from "zod";

export const skillChapterFieldSchema = z.object({
  type: z.literal("skill"),
  artifacts: z.array(z.string()).min(1),
  description: z.string(),
});

export type SkillChapterField = z.infer<typeof skillChapterFieldSchema>;
