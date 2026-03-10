/**
 * Utility for resolving role-declared mount volumes into Docker Compose
 * volume strings.
 *
 * Mount sources may contain `${VAR}` references which are resolved from
 * `process.env` at generation time. Unresolvable variables are left as-is
 * (so Docker Compose's own env substitution can pick them up).
 */

export interface RoleMount {
  source: string;
  target: string;
  readonly: boolean;
}

/**
 * Resolve `${VAR}` placeholders in a string using the given environment map.
 * Unresolvable references are left as-is.
 */
export function resolveEnvVars(
  value: string,
  env: Record<string, string | undefined> = process.env,
): string {
  return value.replace(/\$\{([^}]+)\}/g, (_match, varName: string) => {
    const resolved = env[varName];
    return resolved !== undefined ? resolved : `\${${varName}}`;
  });
}

/**
 * Convert role mounts into Docker Compose volume strings.
 *
 * Each mount becomes `"<resolved-source>:<target>"` or
 * `"<resolved-source>:<target>:ro"` if readonly is true.
 *
 * @param mounts  Role mount declarations (may be undefined/empty).
 * @param env     Environment map for `${VAR}` resolution (defaults to process.env).
 * @returns Array of volume strings ready for YAML output.
 */
export function resolveRoleMountVolumes(
  mounts: RoleMount[] | undefined,
  env?: Record<string, string | undefined>,
): string[] {
  if (!mounts || mounts.length === 0) return [];

  return mounts.map((mount) => {
    const source = resolveEnvVars(mount.source, env);
    const target = resolveEnvVars(mount.target, env);
    const suffix = mount.readonly ? ":ro" : "";
    return `${source}:${target}${suffix}`;
  });
}
