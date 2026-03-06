## Why

The `chapter-members` PRD (REQ-003, REQ-010) requires renaming the package.json metadata field from `"forge"` to `"chapter"`. This is the foundational change that all subsequent PRD changes build on -- the type system, schemas, resolver, and all component packages must read `"chapter"` instead of `"forge"`.

## What Changes

- **BREAKING**: Rename the `"forge"` metadata field key to `"chapter"` in all package.json files
- Rename `src/schemas/forge-field.ts` to `src/schemas/chapter-field.ts`
- Rename all Zod schema exports: `appForgeFieldSchema` -> `appChapterFieldSchema`, `ForgeField` -> `ChapterField`, etc.
- Rename `parseForgeField()` to `parseChapterField()`
- Rename `InvalidForgeFieldError` to `InvalidChapterFieldError`
- Update `pkgJson.forge` -> `pkgJson.chapter` in discover.ts and add.ts
- Update `forgeField` property -> `chapterField` in DiscoveredPackage type
- Rename test file `tests/schemas/forge-field.test.ts` -> `tests/schemas/chapter-field.test.ts`
- Update all component package.json files in `forge-core/` and `templates/` to use `"chapter"` key

## Capabilities

### Modified Capabilities
- `package-schema-validation`: All schema names, types, and the parse function are renamed from `*Forge*` to `*Chapter*`
- `package-discovery`: Discovery reads `pkgJson.chapter` instead of `pkgJson.forge`
- `add-command`: Validation reads `pkgJson.chapter` and error messages reference "chapter"
- `dependency-graph-resolution`: Resolver accesses `chapterField` instead of `forgeField`
- `forge-core-package`: All component package.json files use `"chapter"` key

## Impact

- **Schema files**: `src/schemas/` -- 7 files renamed/modified
- **Resolver**: `src/resolver/` -- 4 files modified
- **CLI**: `src/cli/commands/add.ts`, `list.ts`, `proxy.ts`, `remove.ts`, `install.ts`
- **Top-level exports**: `src/index.ts`, `src/resolver/index.ts`
- **Error classes**: `src/resolver/errors.ts`
- **Tests**: `tests/schemas/` -- 6 files, `tests/resolver/` -- 2 files, `tests/cli/` -- 1 file
- **Package manifests**: `forge-core/**/package.json` -- 5 files, `templates/**/package.json` -- 3 files
