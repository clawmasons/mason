## Context

The `@clawmasons/chapter-core` package is a separately published npm package containing pre-built chapter components (apps, tasks, skills, roles, members). When users run `chapter init --template note-taker`, the resulting project depends on chapter-core from npm. The discovery system (`src/resolver/discover.ts`) has generic logic to scan inside node_modules packages for sub-components — primarily used for chapter-core.

The template system already uses `{{projectScope}}` placeholders for roles and members. This change extends that pattern to apps, tasks, and skills — making initialized projects fully self-contained with all components as local workspace packages.

## Goals / Non-Goals

**Goals:**
- Eliminate the chapter-core npm package and its workspace entry
- Move apps, skills, and tasks into the note-taker template with templatized package names
- Remove the `scanPackageWorkspaceDirs` discovery logic (no longer needed)
- Update all tests and fixtures to reflect the new structure

**Non-Goals:**
- Changing the template placeholder system (`{{projectScope}}`, `{{projectName}}`)
- Modifying the core discovery logic for workspace dirs or direct node_modules packages
- Changing how roles or members work (already templatized)

## Decisions

### 1. Remove `scanPackageWorkspaceDirs` entirely (not just chapter-core references)
The function that scans inside node_modules packages for workspace sub-dirs was designed for chapter-core. With chapter-core removed, no other package uses this pattern. Removing it simplifies the discovery code.

**Alternative considered**: Keep the generic function for future use. Rejected because YAGNI — if a future package needs this pattern, it can be re-added.

### 2. Template component names use `@{{projectScope}}/` prefix
All component package.json files in the template use `@{{projectScope}}/` scoping (e.g., `@{{projectScope}}/app-filesystem`). This matches the existing pattern used for roles and members.

### 3. Copy prompts and skill files alongside package.json
Template components that have additional files (e.g., `tasks/take-notes/prompts/take-notes.md`, `skills/markdown-conventions/SKILL.md`) are copied as-is — they don't contain package name references and need no templatization.

### 4. Update all cross-references within template components
The task's `requires` field and role's `permissions` keys must use `@{{projectScope}}/` scoped names to match the templatized component names.

## Risks / Trade-offs

- **[Breaking change for existing chapter-core users]** → Anyone who depended on `@clawmasons/chapter-core` directly will need to migrate. Mitigation: chapter-core was not yet widely published.
- **[Template size increases]** → Templates now contain more files. Mitigation: The additional files are small (a few package.json files, a markdown prompt, a markdown skill doc).
- **[Discovery test coverage changes]** → Several tests specifically test chapter-core discovery. Mitigation: Remove those test cases and ensure remaining discovery tests cover workspace and node_modules scanning.
