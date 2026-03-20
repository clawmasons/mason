## Context

The codebase was previously renamed from "forge" to "chapter", and now needs to be renamed again to align with the actual product name "mason". Rather than hardcoding "mason" everywhere (repeating the forge→chapter mistake), this change introduces centralized CLI name constants and makes types/classes generic where possible.

The rename touches every package in the monorepo: shared types, CLI discovery/resolution, proxy server, credential service, agent materializers, session management, and all tests.

## Goals / Non-Goals

**Goals:**
- Remove all "chapter" references from code identifiers, file names, env vars, and runtime paths
- Introduce `CLI_NAME_LOWERCASE`, `CLI_NAME_DISPLAY`, `CLI_NAME_UPPERCASE` constants in `packages/shared` so a future rename is a one-line change
- Make type/class names generic where the product name adds no semantic value (e.g., `Field` not `MasonField`)
- Keep the package.json metadata field name dynamic via the constant

**Non-Goals:**
- Migrating existing user data (`~/.chapter/` → `~/.mason/`) — document only, implement separately
- Renaming the npm package scope (`@clawmasons/`) — unrelated to this change
- Updating OpenSpec spec files — those will be updated in a follow-up after the code change lands
- Backward-compatibility shims for the old `CHAPTER_*` env vars or `"chapter"` package.json field

## Decisions

### 1. Constants module location: `packages/shared/src/constants.ts`

Add a new `constants.ts` in shared that exports:
```ts
export const CLI_NAME_LOWERCASE = "mason";
export const CLI_NAME_DISPLAY = "Mason";
export const CLI_NAME_UPPERCASE = "MASON";
```

Re-export from `packages/shared/src/index.ts`.

**Why**: Shared is already the dependency every package imports. A dedicated constants file keeps the values discoverable and trivially greppable. No config system or environment override — the CLI name is a build-time constant, not a runtime setting.

**Alternatives considered**:
- Environment variable for the CLI name → rejected; adds runtime complexity for something that changes once per rebrand
- Putting constants in each package → rejected; defeats the purpose of centralization

### 2. Generic type names (not product-prefixed)

Rename `ChapterField` → `Field`, `AppChapterField` → `AppField`, etc. Do NOT replace with `MasonField`.

**Why**: The "chapter" prefix was semantic noise — `Field` is unambiguous within this codebase. Product-prefixing types couples the type system to the brand name, which is exactly the problem we're solving. If disambiguating is ever needed, the module path (`@clawmasons/shared`) provides it.

**Alternatives considered**:
- `MasonField` → rejected; repeats the same coupling pattern
- Keeping `ChapterField` with an alias → rejected; half-measures create confusion

### 3. Package.json metadata field: use `CLI_NAME_LOWERCASE` dynamically

The `"chapter"` field in package.json files that holds `{ type, ... }` metadata will be renamed to `"mason"`. Discovery code (`discover.ts`, `package-reader.ts`, `discovery.ts`) will read `pkg[CLI_NAME_LOWERCASE]` instead of `pkg.chapter`.

**Why**: The field name is user-facing (authors write it in their package.json), so it should match the CLI name. Using the constant in discovery code means a future rename auto-propagates.

**Note**: Actual package.json files in the repo will be manually updated to use `"mason"` as the key. The constant is used in the code that *reads* the field.

### 4. Env var construction: template from `CLI_NAME_UPPERCASE`

All `CHAPTER_*` environment variables become `` `${CLI_NAME_UPPERCASE}_*` `` via template literals:
- `CHAPTER_DB_PATH` → `` `${CLI_NAME_UPPERCASE}_DB_PATH` ``
- `CHAPTER_PROXY_TOKEN` → `` `${CLI_NAME_UPPERCASE}_PROXY_TOKEN` ``
- etc.

**Why**: Template literals make it obvious these are derived from the CLI name and will auto-update on rename. String concatenation or a helper function would work too, but template literals are the simplest approach.

### 5. Runtime paths: template from `CLI_NAME_LOWERCASE`

- `.chapter/` → `` `.${CLI_NAME_LOWERCASE}/` ``
- `~/.chapter/data/chapter.db` → `` `~/.${CLI_NAME_LOWERCASE}/data/${CLI_NAME_LOWERCASE}.db` ``

**Why**: Same rationale as env vars — derived from the constant so a rename propagates automatically.

### 6. File renames use `git mv`

Source files with "chapter" in the name will be renamed via `git mv`:
- `chapter-field.ts` → `field.ts`
- `chapter-field.test.ts` → `field.test.ts`
- `integration-chapter-proxy.test.ts` → `integration-proxy.test.ts`
- `setup-chapter.ts` → `setup.ts`
- `teardown-chapter.ts` → `teardown.ts`

**Why**: `git mv` preserves history. Import paths across the codebase must be updated to match.

### 7. MCP server config key: use `CLI_NAME_LOWERCASE`

The hardcoded `"chapter"` key in materializer MCP server config objects becomes `[CLI_NAME_LOWERCASE]` (computed property).

**Why**: This is a runtime-visible key that agents use to connect to the proxy. It should match the product name.

### 8. Class renames: drop "Chapter" prefix entirely

- `ChapterProxyServer` → `ProxyServer`
- `ChapterProxyServerConfig` → `ProxyServerConfig`

**Why**: Within `packages/proxy`, there's only one proxy server. The "Chapter" prefix added nothing. The package path (`@clawmasons/proxy`) provides namespace disambiguation.

## Risks / Trade-offs

**[Breaking change for downstream consumers]** → Any external code depending on `ChapterField` types, `CHAPTER_*` env vars, or the `"chapter"` package.json field will break. Mitigation: this is an internal monorepo with no external consumers yet. The rename is clean-break intentional.

**[Existing user data at `~/.chapter/`]** → Users who have run the tool already have data at the old path. Mitigation: migration is explicitly out of scope — document the path change, implement migration logic in a separate change.

**[Dist artifacts stale after rename]** → Built files in `dist/` and `packages/*/dist/` will reference old names. Mitigation: clean build (`rm -rf dist packages/*/dist && npm run build`) required after the rename.

**[Large diff]** → Touching every package in one change creates a big diff. Mitigation: the change is mechanical (find-and-replace + constant introduction), not architectural. Review is straightforward despite size.

**[OpenSpec specs out of date]** → Spec files reference "chapter" extensively. Mitigation: explicitly a non-goal for this change; will be updated in a follow-up.
