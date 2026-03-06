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

const agentMemberSchema = z.object({
  type: z.literal("member"),
  memberType: z.literal("agent"),
  name: z.string(),
  slug: z.string(),
  email: z.string().email(),
  authProviders: z.array(z.string()).optional().default([]),
  description: z.string().optional(),
  runtimes: z.array(z.string()).min(1),
  roles: z.array(z.string()).min(1),
  resources: z.array(resourceSchema).optional().default([]),
  proxy: proxySchema.optional(),
});

const humanMemberSchema = z.object({
  type: z.literal("member"),
  memberType: z.literal("human"),
  name: z.string(),
  slug: z.string(),
  email: z.string().email(),
  authProviders: z.array(z.string()).optional().default([]),
  description: z.string().optional(),
  roles: z.array(z.string()).min(1),
});

export const memberChapterFieldSchema = z.discriminatedUnion("memberType", [
  agentMemberSchema,
  humanMemberSchema,
]);

export type MemberChapterField = z.infer<typeof memberChapterFieldSchema>;
