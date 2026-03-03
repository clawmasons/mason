import { z } from "zod";

const permissionEntrySchema = z.object({
  allow: z.array(z.string()),
  deny: z.array(z.string()),
});

export const rolePamFieldSchema = z.object({
  type: z.literal("role"),
  description: z.string().optional(),
  tasks: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  permissions: z.record(z.string(), permissionEntrySchema),
  constraints: z
    .object({
      maxConcurrentTasks: z.number().int().positive().optional(),
      requireApprovalFor: z.array(z.string()).optional(),
    })
    .passthrough()
    .optional(),
});

export type RolePamField = z.infer<typeof rolePamFieldSchema>;
