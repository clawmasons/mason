import { z } from "zod";

const resourceSchema = z.object({
  type: z.string(),
  ref: z.string(),
  access: z.string(),
});

const proxySchema = z.object({
  port: z.number().int().positive().optional(),
  type: z.enum(["sse", "streamable-http"]).optional(),
});

const acpSchema = z.object({
  port: z.number().int().positive().optional().default(3002),
});

const llmSchema = z.object({
  provider: z.string(),
  model: z.string(),
});

export const agentChapterFieldSchema = z.object({
  type: z.literal("agent"),
  name: z.string(),
  slug: z.string(),
  description: z.string().optional(),
  runtimes: z.array(z.string()).min(1),
  roles: z.array(z.string()).min(1),
  credentials: z.array(z.string()).optional().default([]),
  resources: z.array(resourceSchema).optional().default([]),
  proxy: proxySchema.optional(),
  llm: llmSchema.optional(),
  acp: acpSchema.optional(),
});

export type AgentChapterField = z.infer<typeof agentChapterFieldSchema>;
