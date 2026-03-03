import { z } from "zod";

export const appPamFieldSchema = z
  .object({
    type: z.literal("app"),
    description: z.string().optional(),
    transport: z.enum(["stdio", "sse", "streamable-http"]),
    tools: z.array(z.string()).min(1),
    capabilities: z.array(z.string()).min(1),
    env: z.record(z.string(), z.string()).optional(),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    url: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.transport === "stdio") {
      if (!data.command) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "command is required for stdio transport",
          path: ["command"],
        });
      }
      if (!data.args) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "args is required for stdio transport",
          path: ["args"],
        });
      }
    } else {
      if (!data.url) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "url is required for sse/streamable-http transport",
          path: ["url"],
        });
      }
    }
  });

export type AppPamField = z.infer<typeof appPamFieldSchema>;
