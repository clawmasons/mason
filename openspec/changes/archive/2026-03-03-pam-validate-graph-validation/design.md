## Context

pam is a TypeScript/Node.js project (ESM, Zod, Vitest, Commander.js) with validated schemas for all five pam package types, a CLI entry point with `pam init`, and a fully functional package discovery and dependency graph resolution engine. The resolver produces `ResolvedAgent` objects with all roles, tasks, apps, and skills resolved. The next step is semantic validation — checking that the resolved graph is logically consistent and that governance rules are satisfied.

The PRD §5.3 defines six validation checks. Two are already handled by existing code: circular dependency detection (by the resolver) and schema validation (by Zod schemas at discovery time). The remaining four require a new validation layer that operates on the resolved graph.

## Goals / Non-Goals

**Goals:**
- Implement all six validation checks from PRD §5.3 (four new, two already covered)
- Collect all validation errors rather than fail-fast, so developers see all problems at once
- Expose validation as both a programmatic API and a CLI command (`pam validate <agent>`)
- Return structured validation results with categorized errors
- Exit code 0 on valid, non-zero on invalid — suitable as a CI/CD governance gate

**Non-Goals:**
- toolFilter generation (separate change — uses validation output but is distinct)
- Permission matrix display (`pam permissions` — separate command)
- Lock file generation (`pam build` — separate command)
- Runtime materializer support (validation flags missing materializers, but doesn't implement them)

## Decisions

### 1. Validation operates on ResolvedAgent, not raw packages

**Decision:** The validator takes a `ResolvedAgent` (output of `resolveAgent()`) and runs semantic checks against the fully-resolved tree. It does not re-read the filesystem or re-parse packages.

**Rationale:** The resolver already handles package discovery, schema validation, type checking, and circular dependency detection. The validator adds the semantic layer: cross-referencing permissions, tool lists, and requirements. Separating these concerns keeps both modules focused and testable.

### 2. Collect-all-errors pattern

**Decision:** The validator collects all errors into a `ValidationResult` object containing an array of `ValidationError` items, each with a category, message, and context path. It does not throw on the first error.

**Rationale:** Developers need to see all problems at once. Finding one error, fixing it, re-running, finding another — that's a poor UX. Validation is a batch operation by nature.

### 3. Four validation check categories

**Decision:** Implement four check categories that map to the PRD §5.3 requirements not already covered:

1. **Requirement coverage:** For each task in a role, check that every app in the task's `requires.apps` has a corresponding entry in the parent role's `permissions`.
2. **Tool existence:** For each app in a role's `permissions`, check that every tool in the `allow` list exists in the resolved app's `tools` array.
3. **Skill availability:** For each task in a role, check that every skill in the task's `requires.skills` is resolvable (appears in either the task's resolved skills or the parent role's resolved skills).
4. **App launch config:** For each resolved app, validate that stdio apps have `command` and `args`, and sse/streamable-http apps have `url`. (This is already validated by Zod schemas, but we re-check here for defense-in-depth since the resolved graph might be constructed programmatically.)

Circular dependency detection and basic schema validation are already handled by the resolver and Zod schemas respectively.

**Rationale:** Direct mapping from PRD requirements. Each category produces distinct error types that are actionable ("role X doesn't permit app Y which task Z requires" vs "role X allows tool T on app Y but app Y doesn't expose T").

### 4. Validator source layout

**Decision:**
```
src/validator/
  validate.ts     # Core validation logic: validateAgent(agent) → ValidationResult
  types.ts        # ValidationResult, ValidationError, ValidationErrorCategory
  index.ts        # Re-exports
```

**Rationale:** Mirrors the resolver/ and schemas/ organization. Single-responsibility files. The types module keeps the validation result interface separate from implementation.

### 5. CLI command follows existing pattern

**Decision:** `src/cli/commands/validate.ts` registers the `validate` command with Commander.js following the same pattern as `init.ts`. The command:
1. Discovers packages via `discoverPackages(process.cwd())`
2. Resolves the agent via `resolveAgent(agentName, packages)`
3. Validates via `validateAgent(resolvedAgent)`
4. Outputs results and exits with appropriate code

**Rationale:** Consistent with the existing CLI architecture. The validate command is a pure consumer of the resolver and validator APIs.

### 6. Structured output format

**Decision:** CLI outputs validation errors grouped by category. Each error shows the context path (e.g., `agent → role-issue-manager → task-triage-issue → app-github`) and a clear message. Valid agents get a single success line. Use `--json` flag for machine-readable output.

**Rationale:** Human-readable by default for developer UX. JSON output for CI integration and tooling.

## Risks / Trade-offs

- **[Risk] Runtime support check is incomplete:** The PRD lists "Each declared runtime must have a registered materializer." Since materializers don't exist yet, validation will flag unknown runtimes but cannot verify materializer availability. This is acceptable — the check will be upgraded when materializers are implemented.
- **[Trade-off] Defense-in-depth on app launch config:** The Zod schemas already validate app launch config at parse time. Re-checking in the validator is redundant for the normal flow (discover → resolve → validate) but protects against programmatic construction of ResolvedAgent objects. Minimal cost, safer.
- **[Trade-off] No fix suggestions:** Validation errors describe the problem but don't suggest fixes. This keeps the validator focused. Fix suggestions can be added later.
