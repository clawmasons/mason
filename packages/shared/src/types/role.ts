import type { z } from "zod";
import type {
  roleSchema,
  roleMetadataSchema,
  taskRefSchema,
  appConfigSchema,
  skillRefSchema,
  containerRequirementsSchema,
  governanceConfigSchema,
  resourceFileSchema,
  roleSourceSchema,
  mountConfigSchema,
  toolPermissionsSchema,
} from "../schemas/role-types.js";

export type Role = z.infer<typeof roleSchema>;
export type RoleMetadata = z.infer<typeof roleMetadataSchema>;
export type TaskRef = z.infer<typeof taskRefSchema>;
export type AppConfig = z.infer<typeof appConfigSchema>;
export type SkillRef = z.infer<typeof skillRefSchema>;
export type ContainerRequirements = z.infer<typeof containerRequirementsSchema>;
export type GovernanceConfig = z.infer<typeof governanceConfigSchema>;
export type ResourceFile = z.infer<typeof resourceFileSchema>;
export type RoleSource = z.infer<typeof roleSourceSchema>;
export type MountConfig = z.infer<typeof mountConfigSchema>;
export type ToolPermissions = z.infer<typeof toolPermissionsSchema>;
