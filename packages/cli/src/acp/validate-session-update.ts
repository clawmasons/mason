/**
 * Runtime validation for ACP session update objects.
 *
 * Uses the official Zod schemas from `@agentclientprotocol/sdk` to validate
 * that agent-produced session updates conform to the ACP spec.
 */

import { zSessionUpdate } from "@agentclientprotocol/sdk/dist/schema/zod.gen.js";

export interface AcpValidationResult {
  valid: boolean;
  errors?: string[];
}

/**
 * Validate a session update object against the ACP spec Zod schema.
 *
 * Returns `{ valid: true }` when the update conforms, or
 * `{ valid: false, errors: [...] }` with human-readable issue descriptions.
 */
export function validateSessionUpdate(update: unknown): AcpValidationResult {
  const result = zSessionUpdate.safeParse(update);
  if (result.success) {
    return { valid: true };
  }
  return {
    valid: false,
    errors: result.error.issues.map(
      (i) => `${i.path.join(".")}: ${i.message}`,
    ),
  };
}
