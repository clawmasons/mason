## Context

The project currently uses `@clawforge` as the npm scope across all packages, specs, docs, and code. The `@clawforge` scope is taken on npm, blocking publication. The organization owns the `@clawmasons` npm scope and needs all references updated.

This is a cross-cutting rename affecting 114+ files across source code, tests, specs, PRDs, archived changes, templates, and package manifests.

## Goals / Non-Goals

**Goals:**
- Replace every occurrence of `clawforge` with `clawmasons` across the entire codebase
- Ensure all package.json `name` fields use `@clawmasons/*` scope
- Maintain functional correctness — no behavioral changes beyond the rename
- All tests pass with new naming

**Non-Goals:**
- Changing any functionality, APIs, or behavior
- Renaming the `forge` part of the package name (only the org scope changes)
- Publishing to npm (separate step after merge)
- Changing directory or file names that use `forge` (e.g., `forge-core/` stays)

## Decisions

**1. Global find-and-replace approach**
- Use case-sensitive replacement: `clawforge` → `clawmasons`
- This handles `@clawforge/` scope, `clawforge` in prose, and any compound forms
- Rationale: A mechanical find-and-replace is the safest approach for a pure rename. No manual per-file decisions needed.

**2. Include archived changes**
- Archived specs contain historical `clawforge` references
- Decision: Update them too for consistency — archives should reflect the current project identity
- Alternative considered: Leave archives as-is (rejected — creates confusion when reading history)

**3. Regenerate package-lock.json**
- After renaming package.json `name` fields, the lock file will have stale references
- Decision: Delete and regenerate `package-lock.json` rather than trying to edit it in place
- Rationale: Lock files are auto-generated; manual editing is error-prone

## Risks / Trade-offs

- [Risk: Missed references] → Mitigated by grepping for `clawforge` after replacement and verifying zero matches
- [Risk: Binary/generated files] → Only text files are affected; `package-lock.json` will be regenerated
- [Risk: Breaking test fixtures] → Tests use hardcoded scope names in assertions; the global replace covers these
