import type { ResolvedAgent, ResolvedApp, ResolvedRole } from "@clawmasons/shared";
import type { AgentRegistry } from "@clawmasons/agent-sdk";
import type { ValidationError, ValidationWarning, ValidationErrorCategory, ValidationWarningCategory, ValidationResult } from "./types.js";

/**
 * Check tool existence: every tool in a role's allow-list must
 * exist in the resolved app's tools array.
 */
function checkToolExistence(
  role: ResolvedRole,
  errors: ValidationError[],
): void {
  for (const [appName, perms] of Object.entries(role.permissions)) {
    // Wildcard "*" app or wildcard allow — skip tool existence checks
    if (appName === "*" || perms.allow.includes("*")) continue;

    const resolvedApp = role.apps.find((a) => a.name === appName);
    if (!resolvedApp) {
      // App not resolved — this would have been caught by the resolver.
      // Skip tool checks for unresolved apps.
      continue;
    }

    const appToolSet = new Set(resolvedApp.tools);
    for (const tool of perms.allow) {
      if (!appToolSet.has(tool)) {
        errors.push({
          category: "tool-existence",
          message: `Role "${role.name}" allows tool "${tool}" on app "${appName}" but the app does not expose this tool`,
          context: { role: role.name, app: appName, tool },
        });
      }
    }
  }
}

/**
 * Check app launch config: stdio apps need command+args,
 * sse/streamable-http apps need url.
 */
function checkAppLaunchConfig(
  app: ResolvedApp,
  errors: ValidationError[],
): void {
  if (app.transport === "stdio") {
    if (!app.command) {
      errors.push({
        category: "app-launch-config",
        message: `App "${app.name}" uses stdio transport but has no "command" defined`,
        context: { app: app.name, field: "command" },
      });
    }
    if (!app.args) {
      errors.push({
        category: "app-launch-config",
        message: `App "${app.name}" uses stdio transport but has no "args" defined`,
        context: { app: app.name, field: "args" },
      });
    }
  } else {
    // sse or streamable-http
    if (!app.url) {
      errors.push({
        category: "app-launch-config",
        message: `App "${app.name}" uses ${app.transport} transport but has no "url" defined`,
        context: { app: app.name, field: "url" },
      });
    }
  }
}

/**
 * Collect all unique apps from a resolved agent's roles.
 */
function collectAllApps(agent: ResolvedAgent): ResolvedApp[] {
  const seen = new Set<string>();
  const apps: ResolvedApp[] = [];

  for (const role of agent.roles) {
    for (const app of role.apps) {
      if (!seen.has(app.name)) {
        seen.add(app.name);
        apps.push(app);
      }
    }
  }

  return apps;
}

/**
 * Check credential coverage: every app credential should be declared
 * by the agent. Emits warnings (not errors) for missing credentials.
 */
function checkCredentialCoverage(
  agent: ResolvedAgent,
  warnings: ValidationWarning[],
): void {
  const agentCredentials = new Set(agent.credentials);

  for (const role of agent.roles) {
    for (const app of role.apps) {
      for (const credential of app.credentials) {
        if (!agentCredentials.has(credential)) {
          warnings.push({
            category: "credential-coverage",
            message: `Agent "${agent.agentName}" does not declare credential "${credential}" required by app "${app.name}"`,
            context: { agent: agent.name, credential, app: app.name },
          });
        }
      }
    }
  }
}

/**
 * Delegated agent validation: iterate registered agent packages for each
 * runtime and call their `validate()` method, merging results.
 *
 * Replaces the former hardcoded `checkLlmConfig()` that had per-agent
 * conditional branches. Each agent now owns its validation rules via
 * `AgentPackage.validate()`.
 */
function checkAgentValidation(
  agent: ResolvedAgent,
  errors: ValidationError[],
  warnings: ValidationWarning[],
  agentRegistry?: AgentRegistry,
): void {
  if (!agentRegistry) return;

  // Deduplicate: multiple runtimes may resolve to the same AgentPackage
  const seen = new Set<string>();
  for (const runtime of agent.runtimes) {
    const agentPkg = agentRegistry.get(runtime);
    if (!agentPkg || !agentPkg.validate || seen.has(agentPkg.name)) continue;
    seen.add(agentPkg.name);

    const result = agentPkg.validate(agent);
    for (const err of result.errors) {
      errors.push({
        category: err.category as ValidationErrorCategory,
        message: err.message,
        context: err.context as ValidationError["context"],
      });
    }
    for (const warn of result.warnings) {
      warnings.push({
        category: warn.category as ValidationWarningCategory,
        message: warn.message,
        context: warn.context as ValidationWarning["context"],
      });
    }
  }
}

/**
 * Validate a resolved agent graph for semantic correctness.
 * Runs all validation checks and collects errors and warnings.
 *
 * @param agent - The resolved agent to validate
 * @param agentRegistry - Optional agent registry for delegated validation.
 *   When provided, each agent package's `validate()` is called for runtimes
 *   in the agent. When omitted, agent-specific validation is skipped.
 */
export function validateAgent(agent: ResolvedAgent, agentRegistry?: AgentRegistry): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Check each role
  for (const role of agent.roles) {
    checkToolExistence(role, errors);
  }

  // Check all unique apps for launch config
  const allApps = collectAllApps(agent);
  for (const app of allApps) {
    checkAppLaunchConfig(app, errors);
  }

  // Delegated agent validation (replaces hardcoded checkLlmConfig)
  checkAgentValidation(agent, errors, warnings, agentRegistry);

  // Check credential coverage
  checkCredentialCoverage(agent, warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
