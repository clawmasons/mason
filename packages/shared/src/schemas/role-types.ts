import { z } from "zod";

// --- Sub-schemas ---

export const toolPermissionsSchema = z.object({
  allow: z.array(z.string()).optional().default([]),
  deny: z.array(z.string()).optional().default([]),
});

export const roleMetadataSchema = z.object({
  name: z.string(),
  description: z.string(),
  version: z.string().optional(),
  scope: z.string().optional(),
  package: z.string().optional(),
});

export const taskRefSchema = z.object({
  name: z.string(),
  ref: z.string().optional(),
});

export const skillRefSchema = z.object({
  name: z.string(),
  ref: z.string().optional(),
});

export const appConfigSchema = z.object({
  name: z.string(),
  package: z.string().optional(),
  transport: z
    .enum(["stdio", "sse", "streamable-http"])
    .optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  url: z.string().optional(),
  env: z.record(z.string(), z.string()).optional().default({}),
  tools: toolPermissionsSchema.optional().default({}),
  credentials: z.array(z.string()).optional().default([]),
  location: z.enum(["proxy", "host"]).optional().default("proxy"),
});

export const mountConfigSchema = z.object({
  source: z.string(),
  target: z.string(),
  readonly: z.boolean().optional().default(false),
});

const nullToUndefined = (val: unknown) => val ?? undefined;

export const containerRequirementsSchema = z.object({
  packages: z.preprocess(
    nullToUndefined,
    z
      .object({
        apt: z.array(z.string()).optional().default([]),
        npm: z.array(z.string()).optional().default([]),
        pip: z.array(z.string()).optional().default([]),
      })
      .optional()
      .default({}),
  ),
  ignore: z.preprocess(
    nullToUndefined,
    z
      .object({
        paths: z.array(z.string()).optional().default([]),
      })
      .optional()
      .default({}),
  ),
  mounts: z.preprocess(nullToUndefined, z.array(mountConfigSchema).optional().default([])),
  baseImage: z.string().optional(),
});

export const governanceConfigSchema = z.object({
  risk: z.enum(["HIGH", "MEDIUM", "LOW"]).optional().default("LOW"),
  credentials: z.array(z.string()).optional().default([]),
  constraints: z
    .object({
      maxConcurrentTasks: z.number().int().positive().optional(),
      requireApprovalFor: z.array(z.string()).optional(),
    })
    .optional(),
});

export const resourceFileSchema = z.object({
  relativePath: z.string(),
  absolutePath: z.string(),
  permissions: z.number().optional(),
});

export const roleSourceSchema = z.object({
  type: z.enum(["local", "package"]),
  agentDialect: z.string().optional(),
  path: z.string().optional(),
  packageName: z.string().optional(),
});

// --- Top-level Role schema ---

export const roleSchema = z.object({
  metadata: roleMetadataSchema,
  instructions: z.string(),
  type: z.enum(["project", "supervisor"]).optional().default("project"),
  tasks: z.array(taskRefSchema).optional().default([]),
  apps: z.array(appConfigSchema).optional().default([]),
  skills: z.array(skillRefSchema).optional().default([]),
  sources: z.array(z.string()).optional().default([]),
  container: containerRequirementsSchema.optional().default({}),
  governance: governanceConfigSchema.optional().default({}),
  resources: z.array(resourceFileSchema).optional().default([]),
  source: roleSourceSchema,
});
