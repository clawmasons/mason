import { z } from "zod";

const resourceSchema = z.object({
  type: z.string(),
  ref: z.string(),
  access: z.string(),
});

const proxySchema = z.object({
  image: z.string().optional(),
  port: z.number().int().positive().optional(),
  type: z.enum(["sse", "streamable-http"]).optional(),
});

export const agentForgeFieldSchema = z.object({
  type: z.literal("agent"),
  description: z.string().optional(),
  runtimes: z.array(z.string()).min(1),
  roles: z.array(z.string()).min(1),
  resources: z.array(resourceSchema).optional(),
  proxy: proxySchema.optional(),
});

export type AgentForgeField = z.infer<typeof agentForgeFieldSchema>;
