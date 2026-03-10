import { z } from "zod";

const permissionEntrySchema = z.object({
  allow: z.array(z.string()),
  deny: z.array(z.string()),
});

const mountSchema = z.object({
  source: z.string(),
  target: z.string(),
  readonly: z.boolean().optional().default(false),
});

export const roleChapterFieldSchema = z.object({
  type: z.literal("role"),
  description: z.string().optional(),
  risk: z.enum(["HIGH", "MEDIUM", "LOW"]).optional().default("LOW"),
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
  mounts: z.array(mountSchema).optional(),
  baseImage: z.string().optional(),
  aptPackages: z.array(z.string()).optional(),
});

export type RoleChapterField = z.infer<typeof roleChapterFieldSchema>;
