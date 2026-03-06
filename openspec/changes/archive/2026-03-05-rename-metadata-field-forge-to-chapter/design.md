## Context

The chapter-members PRD requires renaming the package.json metadata field from `"forge"` to `"chapter"` (REQ-003) and renaming internal type-system references (REQ-010, type system portion). This is Change #1 in the implementation plan -- the foundational rename that all subsequent changes (CLI binary, directory structure, member model) build on.

The current codebase uses `"forge"` as the top-level metadata key in all package.json files and the Zod schema system is named accordingly: `appForgeFieldSchema`, `ForgeField`, `parseForgeField()`, etc.

## Goals / Non-Goals

**Goals:**
- Rename the metadata field key from `"forge"` to `"chapter"` in all package.json files
- Rename all Zod schemas, types, and exported symbols from `*ForgeField*` to `*ChapterField*`
- Rename the parse entry point from `parseForgeField()` to `parseChapterField()`
- Rename the `forgeField` property on `DiscoveredPackage` to `chapterField`
- Rename `InvalidForgeFieldError` to `InvalidChapterFieldError`
- Rename source files: `forge-field.ts` -> `chapter-field.ts`, test file accordingly
- Update all consumers across src/ and tests/
- All tests pass, TypeScript compiles, linter passes

**Non-Goals:**
- Renaming the CLI binary (`forge` -> `chapter`) -- that is Change #2
- Renaming directories (`.forge/` -> `.chapter/`, `forge-core/` -> `chapter-core/`) -- those are Changes #2 and #3
- Renaming the npm packages (`@clawmasons/forge` -> `@clawmasons/chapter`) -- that is Change #2
- Renaming environment variables (`FORGE_*` -> `CHAPTER_*`) -- that is Change #3
- Adding the `member` package type -- that is Change #5
- Any backward compatibility for the `"forge"` field key

## Decisions

**1. Mechanical rename approach**
- Rename all schema exports using consistent pattern: `*ForgeField*` -> `*ChapterField*`
- Rename file `forge-field.ts` -> `chapter-field.ts` to match new naming
- Rationale: Consistency. Every reference should use the new name.

**2. Property rename on DiscoveredPackage**
- `forgeField: ForgeField` -> `chapterField: ChapterField`
- This cascades to all resolver code that accesses `pkg.forgeField`
- Rationale: The property name should match the metadata key it represents.

**3. Error class rename**
- `InvalidForgeFieldError` -> `InvalidChapterFieldError`
- Message text changes: "Invalid forge field" -> "Invalid chapter field"
- Rationale: Error messages should use current terminology.

**4. No backward compatibility**
- The PRD explicitly states: "Given a package with `"forge": { ... }`, when parsed, then it fails (no backward compatibility in v1)."
- We will not add fallback logic to check for `"forge"` key.

**5. Component package.json files update**
- All package.json files under `forge-core/` and `templates/` change `"forge": { ... }` to `"chapter": { ... }`
- The metadata field value content stays identical; only the key name changes.

## Risks / Trade-offs

- [Risk: Missed references] -> Mitigated by grepping for `ForgeField`, `parseForgeField`, `forgeField`, and `pkgJson.forge` after all changes and verifying zero results
- [Risk: Breaking discover.ts logic] -> The field access pattern changes from `pkgJson.forge` to `pkgJson.chapter`; a single typo could break all package discovery. Mitigated by existing test coverage.
- [Risk: Import path breakage] -> Renaming `forge-field.ts` to `chapter-field.ts` requires updating all import paths. Mitigated by TypeScript compiler catching missing imports.
